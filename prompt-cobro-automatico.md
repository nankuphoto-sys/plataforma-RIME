# Prompt: Cobro automático (suscripción del SaaS vía Stripe)

## Contexto

Hoy el `Tenant.plan` y el `Tenant.status` (`TRIAL`/`ACTIVE`/`PAST_DUE`/`CANCELLED`)
se asignan a mano en Prisma Studio. No existe ningún flujo de alta de negocios
nuevos (self-service signup) — cada tenant se sigue creando a mano, eso NO
cambia en esta fase. Lo que sí falta es que, una vez que un tenant existe, el
cobro mensual recurrente de SU suscripción a Plataforma Agenda (no confundir
con los pagos que sus clientes finales hacen por una cita — eso ya existe vía
`src/lib/stripe.ts` / `src/app/api/webhooks/stripe/route.ts` y no se toca) se
automatice con Stripe Billing (Subscriptions), y que `Tenant.status` se
mantenga sincronizado solo, sin que nadie tenga que ir a Prisma Studio cada
vez que se cobra o falla un pago.

Wompi queda fuera de esta fase (no tiene un producto de suscripciones nativo
como Stripe; se evaluará en una fase aparte).

Ya existen y NO deben tocarse en su comportamiento actual:
- `src/lib/stripe.ts` — cliente de Stripe configurado (`export const stripe`).
- `src/app/api/webhooks/stripe/route.ts` — maneja `checkout.session.completed`
  para pagos de citas de clientes finales (busca `Payment` por `providerRef`).
  Esta fase le agrega ramas nuevas al MISMO archivo, no crea un segundo
  endpoint de webhook (es la misma cuenta/secreto de Stripe).
- `src/lib/auth-guards.ts` → `requireDashboardAccess`, que ya bloquea TODO el
  dashboard interno si `Tenant.status` es `PAST_DUE` o `CANCELLED`,
  redirigiendo a `/dashboard/[tenantSlug]/account-locked`.
- La página `src/app/dashboard/[tenantSlug]/account-locked/page.tsx`, que
  hoy solo muestra un mensaje estático (léela antes de tocarla).

## Qué hacer

### 1. Schema de Prisma

En `model Tenant` (`prisma/schema.prisma`), agregar dos campos nuevos,
ambos opcionales y únicos:

```prisma
stripeCustomerId     String? @unique
stripeSubscriptionId String? @unique
```

Correr `npx prisma migrate dev --name add_tenant_stripe_billing_fields`.
Es una migración aditiva (columnas nullable), no requiere backfill.

### 2. Variables de entorno nuevas

Agregar a `.env.example` (sin valores reales, igual que las demás):

```
STRIPE_PRICE_INDIVIDUAL=""
STRIPE_PRICE_BASICO=""
STRIPE_PRICE_PREMIUM=""
STRIPE_PRICE_PRO=""
```

Son los IDs de los `Price` de Stripe (uno por cada valor del enum `Plan`) que
yo voy a crear a mano en el Dashboard de Stripe — el código solo los lee de
env, no los crea.

### 3. `src/lib/subscriptionPlans.ts` (archivo nuevo)

Una función `getStripePriceId(plan: Plan): string` que mapea cada valor del
enum `Plan` a la env var correspondiente (`STRIPE_PRICE_INDIVIDUAL`, etc.) y
tira un error claro (`throw new Error(...)`) si la env var no está seteada
para ese plan. No mezclar esto con `src/lib/planLimits.ts` — son cosas
distintas (límites/módulos de producto vs. IDs de facturación de Stripe).

### 4. `requireBillingAccess` en `src/lib/auth-guards.ts` (guard nuevo)

A diferencia de todos los guards existentes, este NO debe pasar por el
bloqueo de `PAST_DUE`/`CANCELLED` — si lo hiciera, un tenant con el pago
fallido nunca podría llegar a la página que le permite arreglar su propio
pago (quedaría en un callejón sin salida). Debe hacer, de forma
independiente a `requireDashboardAccess`:
1. Verificar sesión (redirigir a login si no hay).
2. Cargar el tenant por `tenantSlug`.
3. Verificar que el tenant coincide con el `tenantId` de la sesión (404 si
   no, mismo patrón que el resto de guards).
4. Verificar rol OWNER en alguna sede del tenant (`hasAnyOfRolesInTenantLocations`
   con `["OWNER"]`) — 404 si no cumple, mismo patrón que `requireOwnerAccess`.
5. Devolver `{ session, tenant }`.

Deliberadamente sin chequeo de `tenant.status`.

### 5. `src/app/dashboard/[tenantSlug]/billing/actions.ts` (archivo nuevo)

Dos Server Actions:

**`createSubscriptionCheckoutAction(tenantSlug: string)`**
1. `requireBillingAccess(tenantSlug)`.
2. Si `tenant.stripeCustomerId` no existe, crear un `Customer` en Stripe
   (`stripe.customers.create({ email: session.user.email, name: tenant.name,
   metadata: { tenantId: tenant.id } })`) y guardarlo en
   `tenant.stripeCustomerId` con `prisma.tenant.update`.
3. Crear una Checkout Session en modo suscripción:
   ```ts
   stripe.checkout.sessions.create({
     mode: "subscription",
     customer: stripeCustomerId,
     line_items: [{ price: getStripePriceId(tenant.plan), quantity: 1 }],
     success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${tenantSlug}/billing?checkout=success`,
     cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${tenantSlug}/billing?checkout=cancelled`,
     client_reference_id: tenant.id,
   })
   ```
4. Redirigir (`redirect(session.url)`) a la URL de Checkout devuelta.

**`createBillingPortalSessionAction(tenantSlug: string)`**
1. `requireBillingAccess(tenantSlug)`.
2. Si `tenant.stripeCustomerId` es null, no hacer nada y volver con un query
   param de error (`?error=sin-suscripcion`) — todavía no hay nada que
   gestionar.
3. Si existe, crear una Billing Portal Session
   (`stripe.billingPortal.sessions.create({ customer: tenant.stripeCustomerId,
   return_url: ... })`) apuntando de vuelta a `/dashboard/${tenantSlug}/billing`,
   y redirigir ahí.

Esta segunda acción se va a llamar tanto desde `/billing` como desde
`/account-locked` (paso 7) — por eso no depende de `requireDashboardAccess`
ni de que el tenant esté en buen estado.

### 6. Página `src/app/dashboard/[tenantSlug]/billing/page.tsx` (nueva)

Detrás de `requireBillingAccess`. Muestra:
- Plan actual (`tenant.plan`) y estado actual (`tenant.status`) en texto
  plano, sin badges de colores elaborados — simple, igual de austero que el
  resto del dashboard.
- Si `tenant.stripeSubscriptionId` es null: un botón/form
  "Configurar cobro automático" que llama a `createSubscriptionCheckoutAction`.
- Si `tenant.stripeSubscriptionId` existe: un botón/form
  "Gestionar suscripción / actualizar método de pago" que llama a
  `createBillingPortalSessionAction`.
- Manejar los query params `checkout=success` / `checkout=cancelled` /
  `error=sin-suscripcion` con un mensaje simple (igual patrón que
  `saved`/`error` en la página de Equipo).

Agregar el link "Facturación" en el header de
`src/app/dashboard/[tenantSlug]/page.tsx`, visible solo si `hasOwnerAccess`
(mismo array de links que "Sedes", mismo criterio de rol).

### 7. Extender `src/app/dashboard/[tenantSlug]/account-locked/page.tsx`

Leé el archivo primero para entender su estructura actual. Agregarle un
form/botón "Actualizar método de pago" que llame a
`createBillingPortalSessionAction` (importada desde
`../billing/actions.ts`) — así un OWNER que cayó en `PAST_DUE` puede
resolverlo por su cuenta en vez de depender de que vos lo arregles a mano.
Si `tenant.stripeCustomerId` es null (nunca configuró cobro automático),
mostrar el mensaje estático de "contacta a soporte" que ya existe, sin el
botón.

### 8. Extender `src/app/api/webhooks/stripe/route.ts`

Mantener intacta la rama existente de `checkout.session.completed` para
pagos de citas (búsqueda por `Payment.providerRef`). Agregarle, dentro del
mismo `if (event.type === "checkout.session.completed")`, una condición
adicional: si `session.mode === "subscription"` y `session.client_reference_id`
existe, buscar el `Tenant` por ese id y actualizar
`stripeCustomerId`/`stripeSubscriptionId`/`status: "ACTIVE"`.

Agregar ramas nuevas (`else if`) para:
- `invoice.paid` → tomar `event.data.object.subscription`, buscar el
  `Tenant` por `stripeSubscriptionId`, poner `status: "ACTIVE"` (esto
  también sirve para recuperarse automáticamente de un `PAST_DUE` cuando el
  reintento de Stripe finalmente cobra bien).
- `invoice.payment_failed` → mismo lookup, poner `status: "PAST_DUE"`.
- `customer.subscription.deleted` → buscar `Tenant` por
  `stripeSubscriptionId` igual a `event.data.object.id`, poner
  `status: "CANCELLED"`.

Todas las actualizaciones son simples `prisma.tenant.update` (no hace falta
lógica de idempotencia adicional — son updates directos, sin efectos
secundarios encadenados como el de `Payment`+`Appointment`).

## Qué NO hacer

- No implementar nada de Wompi recurrente en esta fase.
- No crear ningún flujo de self-service signup para tenants nuevos.
- No agregar selector de plan en el Checkout — siempre se usa el `Plan`
  actual del tenant tal cual está en la base. Cambiar de plan sigue siendo
  manual (Prisma Studio) en esta fase; si el plan cambia a mano, el precio
  de Stripe no se actualiza solo (documentalo como hueco conocido, no lo
  resuelvas).
- No tocar el comportamiento existente de la rama de `checkout.session.completed`
  para pagos de citas (`Payment.providerRef`).
- No tocar `requireDashboardAccess` ni el hard-lock de `PAST_DUE`/`CANCELLED`
  que ya existe.
- No tocar `src/lib/wompi.ts`, `src/lib/wompiPayment.ts`, ni su webhook.
- No agregar prorrateo, métricas de uso, ni facturación por cantidad de
  profesionales/sedes — el Checkout es siempre `quantity: 1` al precio fijo
  del plan.
- No tocar `CLAUDE.md`.

## Verificación

1. Crear en el Dashboard de Stripe (modo test) 4 Products con un Price
   recurrente mensual cada uno (podés usar montos de prueba, no hace falta
   que coincidan con los USD reales todavía) y completar las 4 env vars.
2. Con `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (o
   apuntando al túnel de ngrok), agregar los eventos nuevos al listener:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.deleted`.
3. Como OWNER, ir a `/dashboard/[tenantSlug]/billing`, click en "Configurar
   cobro automático", completar el Checkout con la tarjeta de prueba
   `4242 4242 4242 4242`. Confirmar que redirige de vuelta con
   `checkout=success` y que en Prisma Studio el tenant quedó con
   `stripeCustomerId`, `stripeSubscriptionId` y `status: ACTIVE`.
4. Disparar `stripe trigger invoice.payment_failed` (o usar una tarjeta de
   prueba que falla) y confirmar que el tenant pasa a `PAST_DUE`, y que al
   intentar entrar a `/dashboard/[tenantSlug]` ahora redirige a
   `account-locked` (el hard-lock de Fase 6 debe seguir funcionando igual).
5. Desde `/account-locked`, click en "Actualizar método de pago" y
   confirmar que abre el Billing Portal real de Stripe.
6. Disparar `stripe trigger customer.subscription.deleted` y confirmar que
   el tenant pasa a `CANCELLED`.
7. Confirmar que un pago de cita de cliente final (Checkout normal, modo
   `payment`) sigue funcionando exactamente igual que antes — que la nueva
   rama de código no interfiere con la existente.
