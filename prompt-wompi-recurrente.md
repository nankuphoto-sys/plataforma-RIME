# Prompt: Cobro recurrente vía Wompi (Colombia)

## Contexto

Hoy la única forma de automatizar el cobro de la propia suscripción de un
tenant a Plataforma Agenda es Stripe (`prompt-cobro-automatico.md` +
`prompt-cambio-plan.md`, ambos hechos y verificados). Wompi ya se usa para
pagos de citas de clientes finales (`src/lib/wompi.ts`,
`src/lib/wompiPayment.ts`, `src/app/api/webhooks/wompi/route.ts`,
`createWompiCheckoutAction` en `src/app/(public)/[tenantSlug]/actions.ts`)
mediante Web Checkout hospedado (redirect), que sirve para un cobro único
pero no para cobros recurrentes.

Wompi no tiene un objeto "suscripción" como Stripe. El mecanismo real es:
1. Tokenizar el medio de pago del OWNER una sola vez (tarjeta), usando el
   Widget de Wompi en modo tokenización (`https://checkout.wompi.co/widget.js`
   con `data-widget-operation="tokenize"`) — igual de "manos limpias" que el
   Web Checkout actual: nunca vemos ni tocamos el número de tarjeta.
2. Eso genera un `payment_source` (`POST /v1/payment_sources`) que queda
   guardado del lado de Wompi.
3. Cada mes, nuestro propio backend crea una transacción nueva
   (`POST /v1/transactions`) usando ese `payment_source_id` — sin que el
   OWNER tenga que volver a intervenir.
4. Nosotros llevamos la cuenta de cuándo le toca el próximo cobro a cada
   tenant y ejecutamos ese cobro — Wompi no lo hace solo. Por eso esta fase
   también conecta un scheduler real (Vercel Cron) para los crons
   existentes y el nuevo.

Decisiones de producto ya tomadas (no las reabras):
- Sin protocolo 3DS/3RI ni Credential On File (`recurrent: true`) en esta
  fase — eso requiere activación manual del equipo de fraude de Wompi.
  Cobro recurrente básico vía `payment_source_id`, que no requiere ninguna
  aprobación de Wompi.
- Reintentos ante un cobro rechazado: hasta 3 reintentos, a +2, +4 y +7 días
  desde el primer rechazo del ciclo. Si el 3er reintento también falla, el
  tenant pasa a `CANCELLED`. No hay reactivación automática después de
  `CANCELLED` en esta fase (hueco documentado, no lo resuelvas).
- Un tenant usa Stripe O Wompi para su propia suscripción, nunca ambos a la
  vez. Si ya tiene una suscripción de Stripe activa (`stripeSubscriptionId`
  no nulo), la opción de configurar Wompi no debe estar disponible, y
  viceversa.
- Cambio de plan self-service (`changeSubscriptionPlanAction`,
  `prompt-cambio-plan.md`) es exclusivo de tenants con Stripe. Para tenants
  en Wompi, cambiar de plan sigue siendo manual en esta fase (hueco
  documentado, no lo resuelvas) — el cron de cobro siempre usa el
  `tenant.plan` vigente al momento de cobrar, así que un cambio manual sí
  se refleja en el próximo cobro, solo no hay UI de autoservicio para
  eso todavía.
- "Actualizar tarjeta" no existe en esta fase — solo configurar por primera
  vez y cancelar. Si el OWNER quiere cambiar de tarjeta, tendría que
  cancelar y volver a configurar (documentalo como hueco conocido).
- Se conecta Vercel Cron (`vercel.json`) para los 3 crons que ya existen
  (`send-reminders`, `send-followup-reminders`, `detect-inactive-clients`)
  más el nuevo de esta fase. Verificá contra el plan de Vercel del proyecto
  qué cadencias mínimas permite (la información pública al respecto es
  inconsistente incluso entre distintas páginas de la propia documentación
  de Vercel) — si el plan no permite corridas sub-diarias, documentalo como
  limitación conocida en vez de inventar una cadencia que no vaya a andar.

Ya existen y NO deben tocarse en su comportamiento actual:
- Todo lo de Stripe (`src/lib/stripe.ts`, `src/lib/subscriptionPlans.ts`,
  `src/app/api/webhooks/stripe/route.ts`, `billing/actions.ts` existentes,
  `billing/page.tsx` en las partes de Stripe).
- `src/lib/wompi.ts`, `src/lib/wompiPayment.ts` — se les agregan funciones
  nuevas al lado, no se modifican las existentes
  (`generateWompiIntegritySignature`, `verifyWompiWebhookChecksum`,
  `getWompiApiBaseUrl`, `applyWompiTransactionStatus`,
  `confirmWompiTransactionById`).
- `src/app/api/webhooks/wompi/route.ts` — la rama que resuelve pagos de
  citas de clientes finales (`applyWompiTransactionStatus` sobre `Payment`)
  no cambia. Esta fase le agrega una rama nueva al mismo endpoint (mismo
  secreto de eventos), no crea un segundo webhook.
- `createWompiCheckoutAction` (citas de clientes finales) no se toca.
- Los 3 crons existentes (`send-reminders`, `send-followup-reminders`,
  `detect-inactive-clients`) no cambian su lógica interna, solo se agregan
  a `vercel.json`.
- `model Payment` / `model Appointment` — NO se reutilizan para cobros de
  suscripción. Esta fase usa un modelo nuevo separado (ver Qué hacer #1),
  justamente para no tener que tocar `Payment.appointmentId` (hoy
  obligatorio y único, atado 1:1 a una cita).

## Qué hacer

### 1. Schema de Prisma

En `model Tenant`, agregar (todos opcionales salvo los `Int` con default):

```prisma
wompiPaymentSourceId String?   @unique
wompiCardLastFour    String?
wompiNextChargeAt    DateTime?
wompiRetryCount      Int       @default(0)
wompiFirstFailedAt   DateTime?

wompiCharges TenantWompiCharge[]
```

Modelo nuevo, no relacionado a `Payment`/`Appointment`:

```prisma
model TenantWompiCharge {
  id                 String            @id @default(cuid())
  tenantId           String
  tenant             Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  amountInCents      Int
  currency           String            @default("COP")
  status             WompiChargeStatus @default(PENDING)
  reference          String            @unique // referencia única que le mandamos a Wompi
  wompiTransactionId String?           // id de la transacción según Wompi, para poder consultarla
  attemptNumber      Int               @default(1) // 1 = cobro original del mes, 2-4 = reintentos
  createdAt          DateTime          @default(now())
  confirmedAt        DateTime?
}

enum WompiChargeStatus {
  PENDING
  APPROVED
  DECLINED
  ERROR
}
```

Correr `npx prisma migrate dev --name add_tenant_wompi_billing`. Migración
aditiva, sin backfill.

### 2. Variables de entorno nuevas

Agregar a `.env.example`:

```
WOMPI_PRICE_COP_INDIVIDUAL=""
WOMPI_PRICE_COP_BASICO=""
WOMPI_PRICE_COP_PREMIUM=""
WOMPI_PRICE_COP_PRO=""
```

Montos en centavos de COP, uno por plan — mismo patrón que
`STRIPE_PRICE_<PLAN>` en `subscriptionPlans.ts`, pero acá es directamente
el monto (Wompi no tiene un objeto "Price" reutilizable), yo los completo a
mano según la tasa de cambio que decida en su momento.

### 3. `src/lib/wompiSubscriptionPlans.ts` (archivo nuevo)

Mapeo `Plan -> monto en centavos COP`, mismo patrón de error explícito que
`getStripePriceId`:

```ts
export function getWompiPriceInCents(plan: Plan): number
```

No lo mezcles con `subscriptionPlans.ts` (ese es específico de Stripe).

### 4. `src/lib/wompi.ts` — helper nuevo

Agregar (sin tocar las funciones existentes) una función para obtener los
tokens de aceptación necesarios para crear un payment source:

```ts
export async function getWompiAcceptanceTokens(): Promise<{
  acceptanceToken: string;
  personalDataAuthToken: string;
}>
```

Consulta `GET /v1/merchants/{WOMPI_PUBLIC_KEY}` (sin autenticación, es
público) y lee del JSON de respuesta los tokens de aceptación de términos y
de tratamiento de datos personales. **Verificá el nombre exacto de estos
campos contra la documentación/Swagger actual de Wompi antes de
implementar** — no asumas el nombre del campo sin confirmarlo, la
estructura de esta respuesta no se pudo verificar al 100% al escribir este
prompt.

### 5. `src/lib/wompiSubscriptionCharge.ts` (archivo nuevo) — lógica de cobro compartida

Una función central que usan tanto el setup inicial como el cron mensual,
para no duplicar la lógica de cobro/reintentos en dos lugares:

```ts
export async function chargeTenantWompiSubscription(tenant: Tenant): Promise<{ approved: boolean }>
```

1. Generar una `reference` única (ej. `wompi-sub-${tenant.id}-${Date.now()}`).
2. `amountInCents = getWompiPriceInCents(tenant.plan)`.
3. Generar la firma de integridad con `generateWompiIntegritySignature`
   (reutilizar, no reimplementar).
4. Crear el registro `TenantWompiCharge` (`status: PENDING`,
   `attemptNumber` = `tenant.wompiRetryCount + 1`).
5. `POST /v1/transactions` con `payment_source_id: tenant.wompiPaymentSourceId`,
   `amount_in_cents`, `currency: "COP"`, `customer_email`, `reference`,
   `signature`. Guardar el `id` de la transacción de Wompi en
   `wompiTransactionId` del registro `TenantWompiCharge`.
6. El resultado final (aprobado/rechazado) NO se resuelve acá de forma
   optimista — igual que con Stripe, la única fuente de verdad es el
   webhook (paso 7), porque Wompi puede devolver `PENDING` en la respuesta
   inicial y resolver después. Esta función solo dispara el cobro y
   devuelve si la creación de la transacción se pudo iniciar o no (no si
   fue aprobada).

### 6. `src/app/api/webhooks/wompi/route.ts` — rama nueva

Después de la lógica existente que busca un `Payment` por `providerRef`
(cuando no encuentra ninguno — hoy simplemente devuelve `{ received: true }`
sin hacer nada más), agregar: si no hay `Payment` con esa referencia, buscar
un `TenantWompiCharge` por `reference`. Si existe:

- Actualizar su `status` (`APPROVED`/`DECLINED`/`ERROR`, mismo tipo
  `WompiTransactionStatus` que ya usa `applyWompiTransactionStatus`) y
  `confirmedAt` si corresponde.
- Si `APPROVED`: `prisma.tenant.update` con `status: "ACTIVE"`,
  `wompiNextChargeAt: <un mes desde ahora>`, `wompiRetryCount: 0`,
  `wompiFirstFailedAt: null`.
- Si `DECLINED` o `ERROR`:
  - Si `tenant.wompiRetryCount < 3`: incrementar `wompiRetryCount`, setear
    `wompiFirstFailedAt` si todavía es `null` (primer fallo del ciclo), y
    calcular `wompiNextChargeAt` como `wompiFirstFailedAt + offset`, con
    `offset` según el array `[2, 4, 7]` días indexado por el nuevo
    `wompiRetryCount` (1→+2 días, 2→+4 días, 3→+7 días). Poner
    `tenant.status: "PAST_DUE"` si no lo estaba ya.
  - Si `tenant.wompiRetryCount` ya era `3` (este envío era el último
    reintento): `tenant.status: "CANCELLED"`, `wompiNextChargeAt: null`.
    No borrar `wompiPaymentSourceId` (queda guardado, aunque no se use más
    en esta fase).

Esta rama nueva no debe interferir en nada con la rama existente de
`Payment` — solo se ejecuta cuando no hubo match ahí.

### 7. Setup inicial — tokenización + primer cobro

**Página nueva** `src/app/dashboard/[tenantSlug]/billing/wompi-setup/page.tsx`
(detrás de `requireBillingAccess`, reutilizado tal cual): renderiza el
widget de Wompi en modo tokenización dentro de un `<form>` con:
- `method="POST"`, `action="/api/wompi/tokenize-callback"`.
- Un `<input type="hidden" name="tenantSlug" value={tenantSlug} />`.
- El `<script>` del widget con `data-widget-operation="tokenize"` y
  `data-public-key={process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY}` (vas a
  necesitar exponer la public key como variable pública de Next.js si no
  existe ya una — la private key JAMÁS debe llegar al cliente).

**Route Handler nuevo** `src/app/api/wompi/tokenize-callback/route.ts`
(`POST`, no una Server Action — recibe un POST de formulario HTML normal
del widget, no de React):
1. Leer `tenantSlug` y `token` de `request.formData()`.
2. Reusar `requireBillingAccess(tenantSlug)` (funciona igual en un Route
   Handler que en un Server Component/Action).
3. Si `tenant.stripeSubscriptionId` existe: redirigir a
   `/dashboard/${tenantSlug}/billing?error=ya-tenes-stripe` sin llamar a
   Wompi — regla de exclusión mutua.
4. `getWompiAcceptanceTokens()`.
5. `POST /v1/payment_sources` con `type: "CARD"`, `token`, `customer_email`,
   `acceptance_token`, `accept_personal_auth`, usando la clave privada.
6. Si el resultado no es `status: "AVAILABLE"`: redirigir con
   `?error=tarjeta-rechazada`.
7. Si es `AVAILABLE`: guardar `wompiPaymentSourceId` y `wompiCardLastFour`
   (de `public_data.last_four`) en el tenant, y llamar de inmediato a
   `chargeTenantWompiSubscription(tenant)` para el primer cobro (mismo
   comportamiento que Stripe, que cobra apenas se configura).
8. Redirigir a `/dashboard/${tenantSlug}/billing?checkout=wompi-configurado`
   (el resultado del primer cobro se refleja cuando llegue el webhook,
   igual que con Stripe).

### 8. Cron nuevo `src/app/api/cron/charge-wompi-subscriptions/route.ts`

Mismo patrón exacto de autenticación que los 3 crons existentes (copiá
`isAuthorized` tal cual, no la reinventes). Lógica:

```ts
const due = await prisma.tenant.findMany({
  where: {
    wompiPaymentSourceId: { not: null },
    wompiNextChargeAt: { lte: new Date() },
  },
});
```

Para cada uno, `chargeTenantWompiSubscription(tenant)`. Devolver
`{ processed: due.length }` en la respuesta, mismo estilo que los crons
existentes.

### 9. `src/app/dashboard/[tenantSlug]/billing/actions.ts` — acción de cancelar

```ts
export async function cancelWompiSubscriptionAction(tenantSlug: string): Promise<void>
```

1. `requireBillingAccess`.
2. Si no hay `wompiPaymentSourceId`, redirigir con error.
3. `PUT /v1/payment_sources/{id}/void` con la clave privada.
4. `prisma.tenant.update`: `status: "CANCELLED"`, `wompiNextChargeAt: null`.
   Dejar `wompiPaymentSourceId` guardado (ya quedó `VOIDED` del lado de
   Wompi, no sirve para cobrar de nuevo, pero no hace falta borrarlo).
5. Redirigir a `/billing` con mensaje de confirmación.

### 10. `billing/page.tsx` — sección Wompi

Reglas de visibilidad (exclusión mutua con Stripe):
- Si `tenant.stripeSubscriptionId` existe: no mostrar nada de Wompi.
- Si `tenant.wompiPaymentSourceId` NO existe y tampoco hay suscripción de
  Stripe: mostrar un link/botón "Configurar cobro automático (Wompi)" que
  lleva a `/billing/wompi-setup`.
- Si `tenant.wompiPaymentSourceId` existe: mostrar tarjeta terminada en
  `wompiCardLastFour`, `wompiNextChargeAt` (si `status` es `ACTIVE` o
  `PAST_DUE`), y un botón "Cancelar suscripción" (`cancelWompiSubscriptionAction`,
  solo si `status` no es ya `CANCELLED`).
- Manejar los query params nuevos (`checkout=wompi-configurado`,
  `error=ya-tenes-stripe`, `error=tarjeta-rechazada`) con el mismo patrón
  de mensajes que ya existe.
- El botón de "Configurar cobro automático" de Stripe debe ocultarse si
  `tenant.wompiPaymentSourceId` existe (mismo principio de exclusión
  mutua, en el sentido inverso).

### 11. `vercel.json` (archivo nuevo, raíz del proyecto)

```json
{
  "crons": [
    { "path": "/api/cron/send-reminders", "schedule": "0 * * * *" },
    { "path": "/api/cron/send-followup-reminders", "schedule": "0 8 * * *" },
    { "path": "/api/cron/detect-inactive-clients", "schedule": "0 6 * * *" },
    { "path": "/api/cron/charge-wompi-subscriptions", "schedule": "0 9 * * *" }
  ]
}
```

Documentar en el resumen final si el plan de Vercel del proyecto permite
esta cadencia (`send-reminders` cada hora) o si hace falta ajustarla a una
vez al día — no lo asumas, es una limitación de infraestructura que hay
que confirmar contra la cuenta real de Vercel, no algo que se resuelva con
código.

## Qué NO hacer

- No implementar 3DS/3RI ni Credential On File (`recurrent: true`).
- No permitir que un tenant tenga Stripe y Wompi configurados a la vez —
  bloquealo tanto en la UI como server-side en cada acción nueva.
- No construir "actualizar tarjeta" — solo configurar por primera vez y
  cancelar.
- No construir cambio de plan self-service para tenants en Wompi.
- No construir reactivación después de `CANCELLED` por Wompi.
- No tocar `model Payment`, `model Appointment`, ni la rama existente del
  webhook de Wompi que resuelve pagos de citas.
- No tocar nada de Stripe (`stripe.ts`, `subscriptionPlans.ts`, el webhook
  de Stripe, `createSubscriptionCheckoutAction`,
  `createBillingPortalSessionAction`, `changeSubscriptionPlanAction`).
- No tocar los 3 crons existentes más allá de agregarlos a `vercel.json`.
- No enviar notificaciones por WhatsApp/email cuando un cobro falla — fuera
  de esta fase.
- No exponer el número de tarjeta completo en ningún lado — solo los
  últimos 4 dígitos que ya vienen en la respuesta de Wompi.
- No tocar `CLAUDE.md`.

## Verificación

1. Como OWNER de un tenant sin Stripe configurado, entrar a `/billing` y
   confirmar que aparece "Configurar cobro automático (Wompi)".
2. Completar el flujo de tokenización con una tarjeta de prueba de Wompi
   sandbox. Confirmar en el Dashboard de Wompi que se creó un
   `payment_source` con status `AVAILABLE`, y en Prisma Studio que el
   tenant quedó con `wompiPaymentSourceId` y `wompiCardLastFour`.
3. Confirmar que el primer cobro se disparó: revisar que se creó un
   `TenantWompiCharge` con `attemptNumber: 1`, y que tras el webhook quedó
   `APPROVED` con el tenant en `status: ACTIVE` y `wompiNextChargeAt` ~1 mes
   adelante.
4. Simular un rechazo (tarjeta de prueba que declina) y confirmar: el
   tenant pasa a `PAST_DUE` (y por lo tanto a `account-locked` en el
   dashboard interno — el hard-lock existente debe seguir funcionando
   igual), `wompiRetryCount` pasa a 1, `wompiFirstFailedAt` queda seteado,
   y `wompiNextChargeAt` queda ~2 días adelante.
5. Confirmar que con Stripe configurado NO aparece la opción de Wompi en
   `/billing`, y viceversa — probar ambos sentidos.
6. Probar `cancelWompiSubscriptionAction`: confirmar que el `payment_source`
   queda `VOIDED` en Wompi y el tenant pasa a `CANCELLED`.
7. Confirmar que un pago de cita de cliente final por Wompi (Web Checkout
   normal) sigue funcionando exactamente igual que antes.
8. Revisar que `vercel.json` no rompe el deploy — si el plan de Vercin no
   permite la cadencia horaria de `send-reminders`, documentarlo en el
   resumen en vez de forzarlo.
