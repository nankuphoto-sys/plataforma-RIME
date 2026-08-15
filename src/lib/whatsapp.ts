const WHATSAPP_API_VERSION = "v22.0";

// Deja solo dígitos (quita "+", espacios, guiones, paréntesis). Si queda
// vacío o con menos de 8 dígitos, devuelve null (número inválido/incompleto).
export function normalizePhoneForWhatsapp(phone: string): string | null {
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.length >= 8 ? digitsOnly : null;
}

export function buildReminderTemplatePayload(params: {
  to: string; // ya normalizado
  clientName: string;
  serviceName: string;
  startsAtLabel: string;
}): Record<string, unknown> {
  const templateName = process.env.WHATSAPP_REMINDER_TEMPLATE_NAME ?? "recordatorio_cita";
  const templateLang = process.env.WHATSAPP_REMINDER_TEMPLATE_LANG ?? "es_MX";

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
            { type: "text", text: params.serviceName },
            { type: "text", text: params.startsAtLabel },
          ],
        },
      ],
    },
  };
}

// Hace el fetch a la API de Meta con un payload ya armado, sea de plantilla
// de recordatorio de cita o de aviso de recompra — nunca lanza, siempre
// devuelve un resultado tipado.
async function sendWhatsAppMessage(
  payload: Record<string, unknown>
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, error: "WhatsApp Cloud API no está configurado." };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const body = await response.json();

    if (!response.ok) {
      const apiError = body?.error?.message ?? `HTTP ${response.status}`;
      return { ok: false, error: apiError };
    }

    const messageId = body?.messages?.[0]?.id;
    if (!messageId) {
      return { ok: false, error: "La API de WhatsApp no devolvió un id de mensaje." };
    }

    return { ok: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de red desconocido.";
    return { ok: false, error: message };
  }
}

export async function sendWhatsAppTemplateMessage(params: {
  to: string;
  clientName: string;
  serviceName: string;
  startsAtLabel: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  return sendWhatsAppMessage(buildReminderTemplatePayload(params));
}

// Aviso de recompra (Fase 5): mensaje genérico de "te extrañamos" para un
// cliente inactivo, sin servicio ni horario asociados.
export function buildFollowUpTemplatePayload(params: {
  to: string; // ya normalizado
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
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  return sendWhatsAppMessage(buildFollowUpTemplatePayload(params));
}

// Alerta de stock bajo (sesión de Cowork): avisa al número configurado en
// Location.lowStockAlertPhone (por sede — antes era un solo número por
// tenant) que un insumo cruzó su umbral. Sin NotificationQueue
// de por medio a propósito — ese modelo exige appointmentId o clientId, y esto
// no es ni uno ni otro (es un evento de negocio interno, no ligado a un
// cliente puntual). Se dispara fire-and-forget desde donde se detecta el
// cruce; nunca bloquea ni revierte el movimiento de inventario que lo originó.
export function buildLowStockAlertTemplatePayload(params: {
  to: string; // ya normalizado
  itemName: string;
  currentStock: number;
  unit: string;
  locationName: string;
}): Record<string, unknown> {
  const templateName = process.env.WHATSAPP_LOW_STOCK_TEMPLATE_NAME ?? "alerta_stock_bajo";
  const templateLang = process.env.WHATSAPP_LOW_STOCK_TEMPLATE_LANG ?? "es_MX";

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
            { type: "text", text: params.itemName },
            { type: "text", text: `${params.currentStock} ${params.unit}` },
            { type: "text", text: params.locationName },
          ],
        },
      ],
    },
  };
}

export async function sendLowStockAlertWhatsAppMessage(params: {
  to: string;
  itemName: string;
  currentStock: number;
  unit: string;
  locationName: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  return sendWhatsAppMessage(buildLowStockAlertTemplatePayload(params));
}

// Alerta de vencimiento de paquete (Paquetes y bonos de sesiones): avisa a un
// cliente que su paquete prepago está por vencer con sesiones sin usar. A
// diferencia de la alerta de stock bajo, SÍ pasa por NotificationQueue
// (kind: PACKAGE_EXPIRATION) porque es un aviso ligado a un cliente puntual,
// igual que el recordatorio de cita y el seguimiento de recompra.
export function buildPackageExpirationTemplatePayload(params: {
  to: string; // ya normalizado
  clientName: string;
  remainingSessions: number;
  expiresAtLabel: string;
}): Record<string, unknown> {
  const templateName =
    process.env.WHATSAPP_PACKAGE_EXPIRATION_TEMPLATE_NAME ?? "alerta_paquete_vencimiento";
  const templateLang = process.env.WHATSAPP_PACKAGE_EXPIRATION_TEMPLATE_LANG ?? "es_MX";

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
            { type: "text", text: String(params.remainingSessions) },
            { type: "text", text: params.expiresAtLabel },
          ],
        },
      ],
    },
  };
}

export async function sendPackageExpirationWhatsAppMessage(params: {
  to: string;
  clientName: string;
  remainingSessions: number;
  expiresAtLabel: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  return sendWhatsAppMessage(buildPackageExpirationTemplatePayload(params));
}

// Invitación a dejar reseña (Reseñas verificadas): se manda al completar una
// cita, cuando el cliente no tiene email cargado (si lo tiene, se prefiere
// mandarla por email — ver sendReviewInviteEmail). Pasa por NotificationQueue
// (kind: REVIEW_REQUEST) igual que vencimiento de paquete, no es urgente.
export function buildReviewInviteTemplatePayload(params: {
  to: string; // ya normalizado
  clientName: string;
  tenantName: string;
  reviewUrl: string;
}): Record<string, unknown> {
  const templateName = process.env.WHATSAPP_REVIEW_INVITE_TEMPLATE_NAME ?? "invitacion_resena";
  const templateLang = process.env.WHATSAPP_REVIEW_INVITE_TEMPLATE_LANG ?? "es_MX";

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
            { type: "text", text: params.reviewUrl },
          ],
        },
      ],
    },
  };
}

export async function sendReviewInviteWhatsAppMessage(params: {
  to: string;
  clientName: string;
  tenantName: string;
  reviewUrl: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  return sendWhatsAppMessage(buildReviewInviteTemplatePayload(params));
}

// Aviso de cupo liberado (Lista de espera inteligente): avisa a un cliente
// en espera que se liberó un cupo del servicio que quería. A diferencia de
// recordatorio/recompra/vencimiento de paquete, NO pasa por NotificationQueue
// — se manda inmediato, fire-and-forget, justo después de que la cita se
// marca CANCELLED (ver updateAppointmentStatusAction), porque un cupo recién
// liberado es urgente: esperar hasta la próxima corrida horaria de un cron
// (como si pasara por la cola) le daría tiempo a que otro cliente reserve
// ese mismo horario por la agenda pública antes de avisarle al candidato de
// la lista de espera. Mismo mecanismo de disparo que la alerta de stock
// bajo (bypass de la cola), pero por un motivo distinto: esa no tiene
// clientId para encolar, esta sí lo tiene y aun así se manda directo por
// la urgencia. `NotificationKind.WAITLIST_SLOT_OPENED` queda en el enum sin
// uso por ahora, reservado por si en el futuro conviene encolar esto también
// (ej. para reintentos automáticos si falla el primer intento).
export function buildWaitlistSlotOpenedTemplatePayload(params: {
  to: string; // ya normalizado
  clientName: string;
  serviceName: string;
  startsAtLabel: string;
}): Record<string, unknown> {
  const templateName = process.env.WHATSAPP_WAITLIST_TEMPLATE_NAME ?? "cupo_lista_espera";
  const templateLang = process.env.WHATSAPP_WAITLIST_TEMPLATE_LANG ?? "es_MX";

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
            { type: "text", text: params.serviceName },
            { type: "text", text: params.startsAtLabel },
          ],
        },
      ],
    },
  };
}

export async function sendWaitlistSlotOpenedWhatsAppMessage(params: {
  to: string;
  clientName: string;
  serviceName: string;
  startsAtLabel: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  return sendWhatsAppMessage(buildWaitlistSlotOpenedTemplatePayload(params));
}
