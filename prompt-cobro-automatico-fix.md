# Prompt: Cobro automático — corrección de puntos pendientes (7 y 8)

## Contexto

Este es un prompt de corrección sobre `prompt-cobro-automatico.md` (ya ejecutado
antes). Revisé el código directamente (no solo el resumen) y confirmé que los
puntos 1-6 de ese prompt están bien implementados:

- `Tenant.stripeCustomerId` / `stripeSubscriptionId` en el schema, migrados.
- `.env.example` con `STRIPE_PRICE_INDIVIDUAL/BASICO/PREMIUM/PRO`.
- `src/lib/subscriptionPlans.ts` con `getStripePriceId`.
- `requireBillingAccess` en `src/lib/auth-guards.ts`.
- `src/app/dashboard/[tenantSlug]/billing/actions.ts` con
  `createSubscriptionCheckoutAction` y `createBillingPortalSessionAction`.
- `src/app/dashboard/[tenantSlug]/billing/page.tsx` y el link "Facturación"
  en el header del dashboard.

Pero **no se tocaron** los puntos 7 y 8 del prompt original — quedaron
exactamente como estaban antes de esa sesión. Sin el punto 8 en particular,
`Tenant.status` nunca se sincroniza solo (que era el objetivo central de toda
la fase): completar un Checkout no deja al tenant en `ACTIVE` ni guarda
`stripeSubscriptionId`, y un pago fallido nunca lo mueve a `PAST_DUE`.

Este prompt cubre **solo** esos dos puntos. No re-implementes nada de lo que
ya está hecho (arriba).

Ya existen y NO deben tocarse en su comportamiento actual:
- La rama existente de `checkout.session.completed` en
  `src/app/api/webhooks/stripe/route.ts` que maneja pagos de citas de
  clientes finales (busca `Payment` por `providerRef`).
- Todo lo de `billing/actions.ts`, `billing/page.tsx`, `auth-guards.ts`,
  `subscriptionPlans.ts` y el schema — ya están completos, no los edites.

## Qué hacer

### 1. Extender `src/app/dashboard/[tenantSlug]/account-locked/page.tsx`

Leé el archivo primero (hoy solo muestra un mensaje estático). Agregale:

- Importar `createBillingPortalSessionAction` desde `../billing/actions`.
- Si `tenant.stripeCustomerId` existe: mostrar además del mensaje actual un
  form/botón "Actualizar método de pago" que llame a
  `createBillingPortalSessionAction.bind(null, tenantSlug)` (mismo patrón de
  `<form action={...}>` que ya usa `billing/page.tsx`).
- Si `tenant.stripeCustomerId` es `null` (nunca configuró cobro automático):
  no mostrar el botón, dejar solo el mensaje estático de "contacta a
  soporte" que ya existe.
- La página sigue sin usar `requireDashboardAccess` (evita el loop de
  redirects) — su chequeo liviano actual de sesión + tenant no cambia, solo
  necesitás leer también `tenant.stripeCustomerId` en el `findUnique` que ya
  hace.

### 2. Extender `src/app/api/webhooks/stripe/route.ts`

Mantené intacta la rama existente de `checkout.session.completed` para pagos
de citas (búsqueda por `Payment.providerRef`). Agregale, dentro del mismo
`if (event.type === "checkout.session.completed")`, una condición adicional
**antes o después** de la lógica actual (que no interfiera con ella): si
`session.mode === "subscription"` y `session.client_reference_id` existe,
buscar el `Tenant` por ese id (`client_reference_id`) y actualizar
`stripeCustomerId: session.customer as string`,
`stripeSubscriptionId: session.subscription as string`, `status: "ACTIVE"`.

Agregar ramas nuevas (`else if event.type === ...`) para:

- `invoice.paid` → tomar `(event.data.object as Stripe.Invoice).subscription`
  (as string), buscar el `Tenant` por `stripeSubscriptionId` igual a ese
  valor, poner `status: "ACTIVE"` (esto también recupera automáticamente a un
  tenant que estaba `PAST_DUE` cuando el reintento de Stripe cobra bien).
- `invoice.payment_failed` → mismo lookup por `subscription`, poner
  `status: "PAST_DUE"`.
- `customer.subscription.deleted` → tomar
  `(event.data.object as Stripe.Subscription).id`, buscar el `Tenant` por
  `stripeSubscriptionId` igual a ese id, poner `status: "CANCELLED"`.

Para los tres casos: si no se encuentra ningún `Tenant` con ese
`stripeSubscriptionId` (puede ser un evento de otro ambiente apuntando a la
misma cuenta de Stripe, igual que ya se maneja para `Payment`), no hacer
fallar el webhook — simplemente no actualizar nada y seguir devolviendo
`{ received: true }`.

Son `prisma.tenant.update` directos — no hace falta lógica de idempotencia
adicional (a diferencia de `Payment`, no hay un efecto secundario encadenado
tipo `Appointment`).

## Qué NO hacer

- No tocar `billing/actions.ts`, `billing/page.tsx`, `auth-guards.ts`,
  `subscriptionPlans.ts`, ni el schema de Prisma — ya están completos.
- No tocar la rama existente de `checkout.session.completed` para pagos de
  citas (`Payment.providerRef`) ni su lógica de idempotencia.
- No implementar nada de Wompi recurrente.
- No crear ningún flujo de self-service signup para tenants nuevos.
- No agregar selector de plan en ningún lado.
- No tocar `requireDashboardAccess` ni el hard-lock de `PAST_DUE`/`CANCELLED`.
- No tocar `CLAUDE.md`.

## Verificación

1. Con `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (o
   apuntando al túnel de ngrok), agregar los eventos `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.deleted` al listener
   (además de `checkout.session.completed`, que ya estaba).
2. Como OWNER, ir a `/dashboard/[tenantSlug]/billing`, click en "Configurar
   cobro automático", completar el Checkout con la tarjeta de prueba
   `4242 4242 4242 4242`. Confirmar que redirige con `checkout=success` y
   que en Prisma Studio el tenant quedó con `stripeCustomerId`,
   `stripeSubscriptionId` y `status: ACTIVE`.
3. Disparar `stripe trigger invoice.payment_failed` y confirmar que el
   tenant pasa a `PAST_DUE`, que entrar a `/dashboard/[tenantSlug]` redirige
   a `account-locked`, y que ahí ahora aparece el botón "Actualizar método
   de pago" y que al clickearlo abre el Billing Portal real de Stripe.
4. Disparar `stripe trigger customer.subscription.deleted` y confirmar que
   el tenant pasa a `CANCELLED`.
5. Confirmar que un pago de cita de cliente final (Checkout normal, modo
   `payment`) sigue funcionando exactamente igual que antes.
