# Fase 5: CRM predictivo de recompra (avisos automáticos por inactividad)

Este prompt implementa el segundo bloque pendiente de la Fase 5 (ver
`CLAUDE.md`): el diferenciador "CRM predictivo, no solo manual" — detectar
clientes inactivos y dispararles automáticamente un WhatsApp de seguimiento,
sin que nadie del negocio tenga que acordarse de hacerlo a mano.

Reutiliza toda la infraestructura de WhatsApp ya construida en la Fase 1
(`src/lib/whatsapp.ts`, `NotificationQueue`, `CRON_SECRET`) — no inventes un
sistema de envío nuevo.

## Regla de negocio central (no la improvises)

Un cliente es candidato a un aviso de recompra cuando, en el momento de
correr la detección:

1. Tiene **al menos una cita con `status: "COMPLETED"`** en su historial
   (si nunca tuvo una cita completada, no aplica — esto no es una campaña
   para leads nuevos, es un aviso de "te extrañamos" para alguien que ya
   fue cliente real). Solo `COMPLETED` cuenta como "visita real": no
   cuentes `CONFIRMED`, `PENDING` ni `NO_SHOW` para esto.
2. Su cita `COMPLETED` más reciente (`startsAt` más reciente entre las
   `COMPLETED`) tiene **60 días o más** desde `now`.
3. **No tiene ninguna cita futura agendada**: ninguna cita con
   `startsAt >= now` y `status` distinto de `CANCELLED`.
4. Tiene un `phone` que pase `normalizePhoneForWhatsapp` (ya existe en
   `src/lib/whatsapp.ts`).

El umbral de 60 días es una constante fija en código para esta fase — **no**
le agregues configuración por tenant ni UI para cambiarlo (fuera de scope,
ver exclusiones).

## 1. Cambio de schema: `NotificationQueue.clientId`

`NotificationQueue` ya soporta `appointmentId` opcional para recordatorios
de cita. Agrega un campo espejo para los avisos de recompra, que no están
atados a ninguna cita puntual:

```prisma
model NotificationQueue {
  // ...campos existentes...
  clientId String?
  client   Client? @relation(fields: [clientId], references: [id], onDelete: Cascade)
}
```

Agrega la relación inversa `notifications NotificationQueue[]` en el modelo
`Client` (mismo patrón que ya tiene `Appointment`).

Regla que debe quedar clara en el código (coméntala donde corresponda): un
recordatorio de cita (Fase 1) **siempre** tiene `appointmentId` seteado y
`clientId` null; un aviso de recompra (esta fase) **siempre** tiene
`clientId` seteado y `appointmentId` null. Nunca ambos a la vez ni ninguno
de los dos. Esto es lo que permite que cada cron (el de recordatorios de
cita y el nuevo de recompra) filtre sin ambigüedad cuál fila le corresponde.

Genera la migración con `npx prisma migrate dev --name
add_notification_queue_client` (recuerda: detén `npm run dev` y Prisma
Studio antes, vuelve a levantar `npm run dev` después). No hace falta
backfill de datos — el campo nuevo queda `null` en todas las filas
existentes, que es exactamente lo correcto.

## 2. Lógica pura: `src/lib/reengagement.ts`

```ts
export const INACTIVITY_THRESHOLD_DAYS = 60;
export const FOLLOWUP_COOLDOWN_DAYS = 90;

export function isClientInactive(params: {
  lastCompletedAppointmentAt: Date | null;
  hasUpcomingAppointment: boolean;
  now: Date;
}): boolean {
  // implementa exactamente la regla de negocio de la sección de arriba
}
```

Dale su test (`reengagement.test.ts`), cubriendo al menos: cliente sin
ninguna cita completada (false), cliente con cita futura agendada aunque
esté inactivo hace mucho (false), cliente justo debajo del umbral (false),
cliente justo en o sobre el umbral sin cita futura (true).

## 3. `src/lib/whatsapp.ts`: nuevo tipo de mensaje, sin romper el existente

Hoy `sendWhatsAppTemplateMessage` arma su propio payload internamente vía
`buildReminderTemplatePayload` y hace el `fetch` a la API de Meta. Para
poder mandar un mensaje con una plantilla distinta (la de recompra, con
variables distintas: no hay servicio ni horario, es un aviso genérico),
extrae la parte de "mandar este payload ya armado" a una función interna
reutilizable, sin cambiar la firma ni el comportamiento de
`sendWhatsAppTemplateMessage` (que sigue usándola `send-reminders/route.ts`
tal cual, no debe cambiar ni su firma ni su output):

```ts
// Función interna (no exportada) con el fetch + manejo de errores, extraída
// de lo que hoy hace sendWhatsAppTemplateMessage directamente.
async function sendWhatsAppMessage(
  payload: Record<string, unknown>
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  // el mismo cuerpo que ya existe en sendWhatsAppTemplateMessage: valida
  // token/phoneNumberId, hace el fetch, parsea la respuesta, nunca lanza.
}

// sendWhatsAppTemplateMessage sigue exactamente igual desde afuera: misma
// firma, mismo comportamiento — ahora solo delega en sendWhatsAppMessage.
export async function sendWhatsAppTemplateMessage(params: {
  to: string; clientName: string; serviceName: string; startsAtLabel: string;
}) {
  return sendWhatsAppMessage(buildReminderTemplatePayload(params));
}

export function buildFollowUpTemplatePayload(params: {
  to: string;
  clientName: string;
  tenantName: string;
}): Record<string, unknown> {
  const templateName = process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME ?? "seguimiento_recompra";
  const templateLang = process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANG ?? "es_MX";
  return {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.clientName },
            { type: "text", text: params.tenantName },
          ],
        },
      ],
    },
  };
}

export async function sendFollowUpWhatsAppMessage(params: {
  to: string;
  clientName: string;
  tenantName: string;
}) {
  return sendWhatsAppMessage(buildFollowUpTemplatePayload(params));
}
```

Agrega a `.env` (con el mismo patrón que ya existe para las variables de
recordatorio): `WHATSAPP_FOLLOWUP_TEMPLATE_NAME="seguimiento_recompra"` y
`WHATSAPP_FOLLOWUP_TEMPLATE_LANG="es_MX"`.

## 4. Cron 1 — detección: `src/app/api/cron/detect-inactive-clients/route.ts`

Mismo patrón de autorización que `send-reminders/route.ts` (puedes copiar
la función `isAuthorized` tal cual, o extraerla a un helper compartido si
te resulta más prolijo — cualquiera de las dos está bien).

Lógica:

1. Trae hasta 200 `Client` con `phone` no nulo (across todos los tenants —
   es un cron global, cada cliente ya trae su propio `tenantId`; no hace
   falta paginación real en esta fase, con el límite de 200 alcanza).
2. Para cada uno, consulta su cita `COMPLETED` más reciente y si tiene
   alguna cita futura no cancelada (dos queries simples a `Appointment`
   filtradas por `clientId` — no hace falta optimizarlas en una sola
   mega-query para esta fase).
3. Aplica `isClientInactive`. Si no es inactivo, o su teléfono no pasa
   `normalizePhoneForWhatsapp`, sigue con el próximo.
4. Si es candidato, revisa que no tenga ya un aviso de recompra pendiente o
   reciente: busca en `NotificationQueue` una fila con
   `clientId: cliente.id`, `channel: "WHATSAPP"`, `appointmentId: null`, y
   (`status: "SCHEDULED"` — ya hay uno esperando a enviarse — O `status:
   "SENT"` con `sentAt` dentro de los últimos `FOLLOWUP_COOLDOWN_DAYS`
   días). Si existe, sáltalo (no lo dupliques).
5. Si no existe, crea la fila: `tenantId` del cliente, `clientId`,
   `appointmentId: null`, `channel: "WHATSAPP"`, `status: "SCHEDULED"`,
   `scheduledFor: new Date()` (que se envíe en la próxima corrida del cron
   de envío), `payload: { to: <teléfono normalizado>, clientName:
   cliente.name, tenantName: <nombre del tenant del cliente> }`.

Responde `NextResponse.json({ scanned, enqueued })`.

## 5. Cron 2 — envío: `src/app/api/cron/send-followup-reminders/route.ts`

Mismo patrón de `send-reminders/route.ts`, pero:

- Filtra `NotificationQueue` por `channel: "WHATSAPP"`, `status:
  "SCHEDULED"`, `appointmentId: null`, `clientId: { not: null }`,
  `scheduledFor: { lte: new Date() }` (máximo 50 por corrida, igual que el
  cron de recordatorios).
- Para cada una, llama `sendFollowUpWhatsAppMessage` con los datos del
  `payload` (`to`, `clientName`, `tenantName`).
- Actualiza a `SENT` (con `sentAt` y `messageId` mezclados en el payload) o
  `FAILED` (con el error mezclado en el payload), igual que ya hace
  `send-reminders/route.ts` para sus propias filas. No hace falta el chequeo
  de "cita cancelada" que tiene ese cron — acá no hay cita asociada.

Responde `NextResponse.json({ processed, sent, failed })`.

## Qué NO hacer en este prompt (no te salgas de esto)

- No agregues configuración del umbral de inactividad por tenant ni UI para
  cambiarlo — es una constante fija en `reengagement.ts`.
- No agregues una página en el dashboard para ver "clientes inactivos" —
  fuera de esta fase, se puede pedir después si hace falta.
- No cambies la firma ni el comportamiento observable de
  `sendWhatsAppTemplateMessage` ni de `send-reminders/route.ts` — deben
  seguir funcionando exactamente igual que hoy.
- No mandes un WhatsApp real de verdad (no tenemos plantilla aprobada por
  Meta todavía, igual que con los recordatorios de cita — esto sigue
  pendiente y es un paso manual aparte).
- No conectes estos dos crons nuevos a ningún cron real (Vercel Cron, etc.)
  — igual que `send-reminders`, quedan como endpoints protegidos por
  `CRON_SECRET` listos para conectar después.
- No actualices `CLAUDE.md` — yo lo actualizo cuando termine de verificar el
  flujo completo.

## Verificación antes de terminar

- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` — todos limpios.
- Prueba manual: en la base real, marca (vía Prisma Studio) la cita
  `COMPLETED` de algún cliente de prueba con un `startsAt` de hace más de
  60 días y sin ninguna cita futura, corre
  `/api/cron/detect-inactive-clients?secret=<CRON_SECRET>` y confirma que
  se crea la fila en `NotificationQueue` con `clientId` seteado y
  `appointmentId` null. Corre después
  `/api/cron/send-followup-reminders?secret=<CRON_SECRET>` y confirma que,
  sin credenciales reales de Meta configuradas, la fila queda `FAILED` con
  el error `"WhatsApp Cloud API no está configurado."` (mismo
  comportamiento sin credenciales que ya se verificó para los recordatorios
  de cita en la Fase 1).
- Corre de nuevo `/api/cron/detect-inactive-clients` una segunda vez y
  confirma que NO se crea una fila duplicada para ese mismo cliente (la
  regla de dedup/cooldown funciona).
