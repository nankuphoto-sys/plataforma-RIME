# Prompt para Claude Code — Fase 3: pagos con Wompi (Colombia)

Agrega Wompi como segundo método de pago (junto a Stripe, ya implementado) en el
flujo de reserva pública. Wompi es la pasarela colombiana de Bancolombia — la
usamos en vez de Mercado Pago por menor fricción de cuenta.

Basé este prompt en la documentación oficial de Wompi (`docs.wompi.co`), no en
memoria — sigue los formatos exactos que te doy abajo, no los reinventes.

## Alcance de esta tarea (no te salgas de esto)

- Solo **Web Checkout** de Wompi (el formulario HTML que redirige a
  `checkout.wompi.co`). NO implementes el Widget embebido (`WidgetCheckout` JS) —
  mismo criterio que con Stripe: mantenemos todo hosted, sin tocar el DOM de un
  formulario de tarjeta ajeno.
- Wompi Colombia solo soporta **COP** como moneda — no hay elección de moneda.
- NO implementes reembolsos, reportes ni comisiones.
- Sigue filtrando siempre por `tenantId`.
- El enum `PaymentProvider` en `prisma/schema.prisma` tiene un valor
  `MERCADOPAGO` que hay que renombrar a `WOMPI` (nunca llegamos a usar
  Mercado Pago, no hay filas reales con ese valor en la base — es seguro
  renombrarlo). Esto requiere una migración nueva de Prisma
  (`npx prisma migrate dev`, con el nombre que quieras, ej. `rename_mercadopago_to_wompi`).
  IMPORTANTE: antes de correr el comando de migración, detén `npm run dev` (y
  Prisma Studio si está abierto) — si no, Windows bloquea el archivo del motor
  de Prisma con un error `EPERM` al regenerar el cliente. Vuelve a levantar
  `npm run dev` después.

## Sobre el precio en COP (simplificación temporal — coméntala en el código)

`Service.price` es un `Decimal` sin campo de moneda explícito; hasta ahora lo
tratamos como USD (así lo usa Stripe). Wompi solo cobra en COP, así que por
ahora conviértelo con una constante fija documentada como temporal:

```ts
// TODO: esto es una conversión de referencia fija, no una tasa de cambio real.
// Cuando el modelo de precios soporte multi-moneda por tenant, reemplazar esto.
const MOCK_USD_TO_COP_RATE = 4000;
```

`amountInCents` para Wompi = `Math.round(Number(service.price) * MOCK_USD_TO_COP_RATE * 100)`.

## Flujo esperado

### 1. Selección de método de pago

Ahora mismo `BookingWizard.tsx` redirige automáticamente a Stripe apenas se crea
la cita. Cambia esto: después de crear la cita (`createAppointmentAction`),
en vez de redirigir automáticamente, muestra dos botones:

- "Pagar con tarjeta internacional (Stripe)" → llama `createCheckoutSessionAction`
  (ya existe, no la toques).
- "Pagar con Wompi (Colombia)" → llama la nueva `createWompiCheckoutAction`.

### 2. `src/lib/wompi.ts` — helpers

```ts
import crypto from "crypto";

// La clave privada determina el ambiente: prv_test_ = sandbox, prv_prod_ = producción.
export function getWompiApiBaseUrl(): string {
  const isSandbox = (process.env.WOMPI_PRIVATE_KEY ?? "").startsWith("prv_test_");
  return isSandbox ? "https://sandbox.wompi.co/v1" : "https://production.wompi.co/v1";
}

// Firma de integridad para Web Checkout — orden EXACTO según docs de Wompi:
// referencia + monto_en_centavos + moneda + secreto_de_integridad, concatenados
// como strings sin separadores, hasheados con SHA256 (hex).
export function generateWompiIntegritySignature(params: {
  reference: string;
  amountInCents: number;
  currency: string;
}): string {
  const secret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!secret) throw new Error("Falta WOMPI_INTEGRITY_SECRET.");
  const concatenated = `${params.reference}${params.amountInCents}${params.currency}${secret}`;
  return crypto.createHash("sha256").update(concatenated).digest("hex");
}
```

CASO DE PRUEBA CONOCIDO (de la documentación oficial de Wompi — úsalo tal cual en
un test de Vitest para `generateWompiIntegritySignature`, no lo inventes ni lo
cambies, no incluye `expiration_time`):

- reference: `sk8-438k4-xmxm392-sn2m`
- amountInCents: `2490000`
- currency: `COP`
- secreto de integridad usado para generar este caso de prueba (NO es tu
  secreto real de sandbox, es solo el ejemplo de la documentación):
  `prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6`
- Es decir, el string que se concatena y se hashea es exactamente:
  `sk8-438k4-xmxm392-sn2m2490000COPprod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6`
- resultado esperado (SHA256 hex):
  `37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5`

En el test, pasa ese `secreto de integridad` de ejemplo directamente como
parámetro a la función (o mockea `process.env.WOMPI_INTEGRITY_SECRET` con ese
valor para ese test específico) — no uses el secreto real de mi `.env` en el
test, así el test es reproducible por cualquiera sin credenciales reales.

### 3. `createWompiCheckoutAction(tenantSlug, appointmentId)` en `actions.ts`

Misma validación de tenant/appointment que `createCheckoutSessionAction`. Luego:

- Crea o reutiliza el `Payment` con `provider: "WOMPI"`, `status: "PENDING"`,
  `amount: appointment.service.price`, `currency: "COP"`.
- Genera una referencia única y **nueva en cada intento** (Wompi no permite
  reusar una referencia ya utilizada): ej.
  `` `${appointment.id}-${Date.now()}` ``.
- Calcula `amountInCents` con la conversión temporal de arriba.
- Genera la firma con `generateWompiIntegritySignature`.
- Guarda esa referencia en `Payment.providerRef` (así identificamos el pago
  después, tanto en el webhook como al volver del checkout — Wompi siempre
  devuelve nuestra misma referencia en `transaction.reference`).
- Construye la URL de Web Checkout como un GET con querystring (no hace falta
  el `<form>` HTML, arma la URL directo en el servidor):

  ```
  https://checkout.wompi.co/p/?public-key=<WOMPI_PUBLIC_KEY>&currency=COP&amount-in-cents=<amountInCents>&reference=<reference>&signature:integrity=<firma>&redirect-url=<baseUrl>/<tenantSlug>?appointment=<appointmentId>%26wompi=return
  ```

  Usa `URLSearchParams` para construirla correctamente (recuerda que la key
  `signature:integrity` literalmente tiene un `:` en el nombre — así la espera
  Wompi, no lo cambies a guion ni a otra cosa). Reutiliza el mismo helper
  `getBaseUrl()` (por header `host`) que ya existe en `actions.ts` para el
  `redirect-url`.
- Devuelve esa URL para que `BookingWizard.tsx` redirija
  (`window.location.href`), igual que con Stripe.

### 4. Al volver del checkout — confirmar sin depender del webhook

A diferencia de Stripe, Wompi redirige de vuelta con `?id=<transaction_id>` en
la URL apenas termina el pago (no hay `success`/`cancelled` separados). En
`page.tsx`, cuando la URL tenga `wompi=return` y Wompi haya agregado su propio
`?id=...`, antes de renderizar:

- Llama a `GET {getWompiApiBaseUrl()}/transactions/{id}` con header
  `Authorization: Bearer ${process.env.WOMPI_PRIVATE_KEY}` para obtener el
  estado real de la transacción (`APPROVED`, `DECLINED`, `PENDING`, `VOIDED`,
  `ERROR`) — nunca confíes en un parámetro de la URL sin verificar contra la
  API.
- Busca el `Payment` por `providerRef` igual a `transaction.reference` (el
  campo `reference` que viene en la respuesta de la API, no el `id`).
- Si el `Payment` no está ya en estado terminal, aplica la misma lógica de
  actualización que describo en el punto 5 (compártela en una función, no la
  dupliques entre el webhook y esta página).

### 5. `src/app/api/webhooks/wompi/route.ts`

Body que envía Wompi (`POST`), tal cual está documentado:

```json
{
  "event": "transaction.updated",
  "data": { "transaction": { "id": "...", "amount_in_cents": 4490000, "reference": "...", "currency": "COP", "status": "APPROVED" } },
  "environment": "test",
  "signature": { "properties": ["transaction.id", "transaction.status", "transaction.amount_in_cents"], "checksum": "..." },
  "timestamp": 1532941443,
  "sent_at": "2018-07-20T16:45:05.000Z"
}
```

- Verifica el checksum ANTES de procesar nada: por cada string en
  `signature.properties` (ej. `"transaction.id"`), navega el objeto `data` con
  ese path (soporta paths anidados con punto) y concatena el valor en el mismo
  orden en que aparecen en el array. Al final concatena `timestamp`. Con eso +
  `process.env.WOMPI_EVENTS_SECRET`, saca un SHA256 hex y compáralo con
  `signature.checksum`. Si no coincide, responde 400 y no proceses nada.
  IMPORTANTE (está explícito en la documentación de Wompi): `properties` puede
  variar entre eventos — sácalo siempre del evento recibido, NUNCA lo
  hardcodees como un array fijo en el código.
- Si `event !== "transaction.updated"`, responde 200 sin hacer nada más.
- Busca el `Payment` por `providerRef === data.transaction.reference`. Si no
  existe, responde 200 igual (puede ser de otro ambiente).
- Reutiliza la misma función de actualización de estado del punto 4:
  - `APPROVED` → si el `Payment` no está ya `PAID`: márcalo `PAID` +
    `confirmedAt`, y si la transición es válida según
    `ALLOWED_STATUS_TRANSITIONS`, marca el `Appointment` como `CONFIRMED`.
  - `DECLINED` / `ERROR` / `VOIDED` → marca el `Payment` como `FAILED` (no
    toques el estado de la cita — que quede pendiente para que el staff la
    revise manualmente, no construyas cancelación automática).
  - `PENDING` → no hagas nada todavía.
  - Idempotencia: si el `Payment` ya está en un estado terminal (`PAID` o
    `FAILED`) no lo vuelvas a tocar.
- Responde 200 rápido.

## Configuración necesaria

- Agrega a `.env.example` (placeholders vacíos):
  ```
  WOMPI_PUBLIC_KEY=
  WOMPI_PRIVATE_KEY=
  WOMPI_INTEGRITY_SECRET=
  WOMPI_EVENTS_SECRET=
  ```
  Yo ya tengo los valores reales de sandbox en mi `.env` local — no lo toques.

## Verificación que quiero ver en tu resumen

- `npx tsc --noEmit` sin errores.
- `next lint` sin warnings.
- `npx vitest run` — incluye el test de `generateWompiIntegritySignature` con el
  caso de prueba exacto que te di arriba (debe dar
  `37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5`). Agrega
  también un test para la función que verifica el checksum del webhook, con un
  payload de ejemplo armado por ti donde generes el checksum correcto y
  confirmes que la validación lo acepta, y otro donde lo alteres y confirmes
  que lo rechaza.
- Pasos manuales que yo debo hacer para probar esto: aclara explícitamente que
  el flujo completo (checkout → pago → vuelta → confirmación) se puede probar
  SIN necesitar ngrok todavía, porque la página de retorno confirma el pago
  llamando directo a la API de Wompi. El webhook con ngrok es una capa
  adicional que probamos después, por separado.

No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar el
flujo completo.
