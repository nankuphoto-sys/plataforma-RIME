# Recordatorios automáticos por WhatsApp (pendiente de la Fase 1)

Contexto: agenda pública/interna, CRM y pagos (Stripe + Wompi) ya están
listos. Esto es lo único que faltaba de la Fase 1 del roadmap (ver
`CLAUDE.md`): recordatorios automáticos de citas por WhatsApp. Usamos **la
API de Meta directa (WhatsApp Cloud API)**, NO Twilio — ya está anticipado en
`.env` (`WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) y en el Stack
de `CLAUDE.md`. **No te salgas de este alcance** — no toques pagos, no
toques el CRM salvo lo mínimo indicado abajo, no implementes recordatorios
por email/SMS (el modelo ya los contempla en el enum pero no los
implementes ahora), no implementes reintentos automáticos de envíos
fallidos, no implementes un editor de plantillas — la plantilla de mensaje
se crea y aprueba manualmente en Meta Business Manager, fuera de este código.

## Cómo funciona la API de Meta (investigado en la documentación oficial)

- Endpoint: `POST https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`
- Header: `Authorization: Bearer {WHATSAPP_CLOUD_API_TOKEN}`, `Content-Type: application/json`.
- Fuera de la ventana de 24h de servicio al cliente (que es siempre el caso
  para un recordatorio proactivo), **solo se pueden enviar mensajes de
  plantilla previamente aprobados por Meta** — no texto libre. El body es:

```json
{
  "messaging_product": "whatsapp",
  "to": "573001234567",
  "type": "template",
  "template": {
    "name": "recordatorio_cita",
    "language": { "code": "es_MX" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "María Pérez" },
          { "type": "text", "text": "Primera consulta" },
          { "type": "text", "text": "jueves 30 de julio a las 09:50" }
        ]
      }
    ]
  }
}
```

  (`parameters` va en el mismo orden que las variables `{{1}}`, `{{2}}`,
  `{{3}}` del cuerpo de la plantilla aprobada en Meta.)
- `to` debe ser el número completo con código de país, solo dígitos, sin
  `+` ni espacios ni guiones (ej. `573001234567`).
- Asumimos que el negocio ya creó y le aprobaron en Meta Business Manager una
  plantilla de categoría "Utilidad" con exactamente 3 variables de cuerpo, en
  este orden: nombre del cliente, nombre del servicio, fecha y hora legible.
  El nombre y el idioma de esa plantilla van por variables de entorno
  (`WHATSAPP_REMINDER_TEMPLATE_NAME`, default `"recordatorio_cita"`;
  `WHATSAPP_REMINDER_TEMPLATE_LANG`, default `"es_MX"`), no hardcodeados, para
  que se puedan ajustar sin tocar código cuando se cree la plantilla real.
  Agrégalas a `.env` y `.env.example` con esos defaults.
- Errores comunes de la API (van a pasar en pruebas, hay que manejarlos sin
  reventar el cron job, solo marcar el envío como fallido):
  - `#131047` — mensaje fuera de la ventana de 24h sin plantilla (no debería
    pasar porque siempre mandamos `type: template`, pero puede pasar si la
    plantilla no existe/no está aprobada).
  - `#131056` — el número destino no está en la lista de receptores de
    prueba (aplica en modo sandbox antes de verificar el negocio).
  - `#132000` — la cantidad de `parameters` no coincide con las variables de
    la plantilla.
  - `#133010` — el número de teléfono del negocio (`WHATSAPP_PHONE_NUMBER_ID`)
    no está registrado en Cloud API.

## Qué ya existe (no dupliques ni modifiques el schema)

`NotificationQueue` en `prisma/schema.prisma` YA tiene todo lo necesario —
**no agregues columnas ni migres nada**:

```prisma
model NotificationQueue {
  id            String               @id @default(cuid())
  tenantId      String
  tenant        Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  appointmentId String?
  appointment   Appointment?         @relation(fields: [appointmentId], references: [id])
  channel       NotificationChannel  // WHATSAPP | EMAIL | SMS
  status        NotificationStatus   @default(SCHEDULED) // SCHEDULED | SENT | FAILED
  scheduledFor  DateTime
  sentAt        DateTime?
  payload       Json                 @default("{}")
}
```

Usa `payload` para guardar `to` (teléfono normalizado), `clientName`,
`serviceName`, `startsAtLabel` (el texto ya formateado para la plantilla), y
al procesar el envío agrégale `messageId` (éxito) o `error` (fallo) — así
queda trazable sin campos nuevos.

## 1. Lógica pura (con tests Vitest — sigue el patrón de `src/lib/wompi.ts`)

### `src/lib/reminderScheduling.ts`

```ts
export const REMINDER_HOURS_BEFORE = 24;

// Devuelve la fecha en la que debe dispararse el recordatorio (24h antes del
// inicio de la cita), o null si la cita es en menos de 24h desde `now` — en
// ese caso no tiene sentido programar un recordatorio "24h antes" que ya
// nació en el pasado, así que simplemente no se crea.
export function computeReminderScheduledFor(startsAt: Date, now: Date): Date | null {
  const scheduledFor = new Date(startsAt.getTime() - REMINDER_HOURS_BEFORE * 60 * 60 * 1000);
  return scheduledFor > now ? scheduledFor : null;
}

export function formatAppointmentDateTimeLabel(startsAt: Date, timezone: string): string {
  // Reutiliza el mismo estilo de formato legible en español que ya se usa en
  // el resto de la app (ver formatFullDateTime en
  // src/app/(public)/[tenantSlug]/PostCheckoutStatus.tsx) — día de la
  // semana, día, mes, y hora en 24h, en la timezone de la sede.
}
```

Test (`reminderScheduling.test.ts`): `computeReminderScheduledFor` con una
cita a 48h de distancia devuelve `startsAt - 24h`; con una cita a 2h de
distancia devuelve `null`. `formatAppointmentDateTimeLabel` devuelve el
formato esperado para una fecha fija.

### `src/lib/whatsapp.ts`

Separa lo puro (testable sin red) de lo que hace `fetch` (no unit-testeado,
se verifica en vivo después, igual que `confirmWompiTransactionById` en
Wompi):

```ts
export function normalizePhoneForWhatsapp(phone: string): string | null {
  // Deja solo dígitos (quita "+", espacios, guiones, paréntesis). Si queda
  // vacío o con menos de 8 dígitos, devuelve null (número inválido/incompleto).
}

export function buildReminderTemplatePayload(params: {
  to: string; // ya normalizado
  clientName: string;
  serviceName: string;
  startsAtLabel: string;
}): Record<string, unknown> {
  // Arma exactamente el body de arriba (messaging_product, to, type,
  // template.name desde WHATSAPP_REMINDER_TEMPLATE_NAME, template.language.code
  // desde WHATSAPP_REMINDER_TEMPLATE_LANG, components[0].parameters con los
  // 3 valores en orden).
}

export async function sendWhatsAppTemplateMessage(params: {
  to: string;
  clientName: string;
  serviceName: string;
  startsAtLabel: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  // POST a la API de Meta con buildReminderTemplatePayload(...). Nunca
  // lances una excepción sin capturar — atrapa errores de red y de la API
  // (status != 2xx) y devuelve { ok: false, error } para que el cron job
  // pueda marcar el NotificationQueue como FAILED sin caerse.
}
```

Tests: `normalizePhoneForWhatsapp` con casos `"+57 300 123 4567"` →
`"573001234567"`, `"3001234567"` → `"3001234567"`, `""` → `null`.
`buildReminderTemplatePayload` devuelve exactamente la forma esperada
(puedes mockear `process.env.WHATSAPP_REMINDER_TEMPLATE_NAME` en el test).

## 2. Encolar el recordatorio al crear la cita

Único cambio permitido en
`src/app/(public)/[tenantSlug]/actions.ts`: dentro de
`createAppointmentAction`, **después** de que la transacción de creación de
la cita se resuelve con éxito (no adentro de la transacción — no hace falta
esa atomicidad para esto), si `client.phone` no está vacío:

1. Normaliza el teléfono con `normalizePhoneForWhatsapp`.
2. Calcula `computeReminderScheduledFor(startsAt, new Date())`.
3. Si el teléfono normalizado existe Y `scheduledFor` no es `null`, crea un
   `NotificationQueue`:
   ```ts
   await prisma.notificationQueue.create({
     data: {
       tenantId: tenant.id,
       appointmentId: appointment.id,
       channel: "WHATSAPP",
       status: "SCHEDULED",
       scheduledFor,
       payload: {
         to: normalizedPhone,
         clientName: name,
         serviceName: service.name,
         startsAtLabel: formatAppointmentDateTimeLabel(startsAt, location.timezone),
       },
     },
   });
   ```
4. Si falta el teléfono o la cita es en menos de 24h, simplemente no se
   encola nada — no es un error, no bloquees ni muestres nada al cliente por
   esto.

No cambies nada más en ese archivo ni en `BookingWizard.tsx`.

## 3. Endpoint que procesa y envía los recordatorios pendientes

`src/app/api/cron/send-reminders/route.ts` — `GET`:

- Protegido por secreto compartido: lee `CRON_SECRET` de `.env` (agrégalo a
  `.env` y `.env.example`, sin valor real). Acepta el secreto por header
  `Authorization: Bearer {secret}` O por query param `?secret=` (el query
  param es solo para poder probarlo a mano desde el navegador en desarrollo
  local, donde no hay un cron real corriendo). Si no coincide, `401`.
- Busca hasta 50 pendientes vencidos:
  ```ts
  const due = await prisma.notificationQueue.findMany({
    where: { channel: "WHATSAPP", status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    include: { appointment: true },
    take: 50,
    orderBy: { scheduledFor: "asc" },
  });
  ```
- Para cada uno:
  - Si `appointment` no existe o `appointment.status === "CANCELLED"` →
    actualiza a `status: "FAILED"`, agrega `error: "appointment_cancelled_or_missing"`
    al `payload` existente (no lo reemplaces, mergea), continúa con el
    siguiente.
  - Si no, llama a `sendWhatsAppTemplateMessage` con los datos de `payload`
    (ya vienen armados desde que se encoló). Si `ok: true` → `status: "SENT"`,
    `sentAt: new Date()`, agrega `messageId` al payload. Si `ok: false` →
    `status: "FAILED"`, agrega `error` al payload.
- No implementes reintentos ni backoff — un fallo se queda en `FAILED` y ya
  (queda trazable en la base para revisar a mano; reintentos automáticos son
  una mejora futura fuera de esta fase).
- Responde `200` con `{ processed, sent, failed }`.

## 4. Qué NO hacer en esta fase

- No implementes envío por EMAIL ni SMS (aunque el enum los contempla).
- No implementes reintentos automáticos de fallidos.
- No implementes un builder de plantillas ni sincronices plantillas desde la
  API de Meta — el nombre/idioma de la plantilla son variables de entorno,
  la plantilla en sí se gestiona a mano en Meta Business Manager.
- No conectes un cron real (Vercel Cron, etc.) — eso es configuración de
  despliegue, fuera del alcance de este código. Deja el endpoint listo para
  que se pueda invocar periódicamente cuando corresponda.
- No cambies el flujo de cancelación/cambio de estado de citas en el
  dashboard — el chequeo de "cita cancelada" pasa en el momento del envío
  (paso 3), no reaccionando a cambios de estado en tiempo real.

## 5. Verificación antes de terminar

- `npm run lint`, `npx tsc --noEmit`, `npx vitest run` — todo sin errores,
  incluyendo los tests nuevos de `reminderScheduling.test.ts` y `whatsapp.test.ts`.
- Prueba manual SIN credenciales reales de Meta (para verificar que el
  encolado y el cron funcionan a nivel de base de datos, no de envío real):
  1. Reserva una cita de prueba desde `/consultorio-demo` con un horario a
     más de 24h de distancia y un teléfono cualquiera.
  2. Confirma en Prisma Studio (o una query) que se creó un
     `NotificationQueue` con `status: "SCHEDULED"`, `channel: "WHATSAPP"`, y
     `scheduledFor` = inicio de la cita menos 24h.
  3. Llama al endpoint (`GET /api/cron/send-reminders?secret=...`) — como el
     `scheduledFor` todavía no venció, no debería procesarlo (`processed: 0`).
  4. Si quieres forzar el procesamiento para probar el flujo completo, edita
     a mano `scheduledFor` a una fecha pasada en Prisma Studio para ese
     registro y vuelve a llamar el endpoint — sin `WHATSAPP_CLOUD_API_TOKEN`
     real esto debería fallar al llamar a la API de Meta y el registro debe
     quedar en `status: "FAILED"` con el error en `payload` (esto confirma
     que el manejo de errores no rompe el endpoint, no que el envío
     funciona — el envío real necesita credenciales reales de Meta, que se
     configuran después, fuera de este código).

No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar el
flujo completo (incluyendo, si es posible, un envío real de prueba una vez
tengamos credenciales de sandbox de Meta).
