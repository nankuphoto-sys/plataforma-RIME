import { Resend } from "resend";

// Nota: `onboarding@resend.dev` es el remitente de sandbox de Resend —
// funciona sin verificar un dominio propio, pero (limitación de Resend, no
// de este código) en cuentas sin dominio verificado solo entrega al email
// con el que se creó la cuenta de Resend. Verificar un dominio propio queda
// fuera de esta fase.
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  try {
    // El constructor de Resend tira si la API key es un string vacío/undefined,
    // así que se instancia acá adentro (no a nivel de módulo) para que
    // importar este archivo sin RESEND_API_KEY configurada no rompa toda la
    // página que lo usa — solo falla, silenciosamente, el envío en sí.
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "RIME <onboarding@resend.dev>",
      to,
      subject: "Restablecé tu contraseña — RIME",
      html: `
        <p>Recibimos un pedido para restablecer tu contraseña.</p>
        <p><a href="${resetUrl}">Hacé clic acá para elegir una nueva contraseña</a>.</p>
        <p>Este link expira en 1 hora. Si no pediste esto, podés ignorar este correo.</p>
      `,
    });
  } catch (error) {
    // No relanzar: que falle el envío de email no debe romper la respuesta
    // al usuario (requestPasswordResetAction nunca revela si el envío
    // funcionó o no). Solo lo logueamos para poder diagnosticarlo.
    console.error("Error enviando email de reseteo de contraseña", error);
  }
}

// Invitación a dejar reseña (Reseñas verificadas), enviada por el cron
// send-review-requests. A diferencia de sendPasswordResetEmail, sí devuelve
// {ok}: el cron necesita saber si marcar la fila de NotificationQueue como
// SENT o FAILED, igual que ya hace sendXWhatsAppMessage en src/lib/whatsapp.ts.
export async function sendReviewInviteEmail(
  to: string,
  reviewUrl: string,
  tenantName: string
): Promise<{ ok: true; messageId: null } | { ok: false; error: string }> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "RIME <onboarding@resend.dev>",
      to,
      subject: `¿Cómo te fue en ${tenantName}?`,
      html: `
        <p>Gracias por tu visita a ${tenantName}.</p>
        <p><a href="${reviewUrl}">Contanos cómo te fue</a> — te toma menos de un minuto.</p>
        <p>Este link es personal y vence en 30 días.</p>
      `,
    });
    return { ok: true, messageId: null };
  } catch (error) {
    console.error("Error enviando email de invitación a reseña", error);
    return { ok: false, error: error instanceof Error ? error.message : "Error desconocido" };
  }
}

// Aviso al profesional de que se le pagó su comisión pendiente de un rango
// de fechas — dispara desde markCommissionAsPaidAction. No pasa por
// NotificationQueue (igual que sendLowStockAlertWhatsAppMessage): es un
// aviso interno al equipo del negocio, no a un cliente, y no necesita
// reintentos ni tracking de estado — si falla, el pago ya quedó registrado
// en Appointment.commissionPaidAt de todos modos, el email es solo cortesía.
export async function sendCommissionPaidEmail(params: {
  to: string;
  professionalName: string;
  amountLabel: string;
  appointmentCount: number;
  fromLabel: string;
  toLabel: string;
  tenantName: string;
}): Promise<void> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "RIME <onboarding@resend.dev>",
      to: params.to,
      subject: `Se te pagó tu comisión — ${params.tenantName}`,
      html: `
        <p>Hola ${params.professionalName},</p>
        <p>Se marcó como pagada tu comisión de <strong>${params.amountLabel}</strong>
        correspondiente a ${params.appointmentCount} ${params.appointmentCount === 1 ? "cita" : "citas"}
        entre el ${params.fromLabel} y el ${params.toLabel}.</p>
        <p>Este es un aviso automático de ${params.tenantName} — no hace falta que respondas este correo.</p>
      `,
    });
  } catch (error) {
    // No relanzar, mismo criterio que sendPasswordResetEmail: el pago ya
    // quedó registrado en la base sin importar si este aviso sale o no.
    console.error("Error enviando email de comisión pagada", error);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Campaña de marketing masivo, enviada por el cron
// send-marketing-campaign-emails. `body` es texto plano (lo escribió el
// dueño del negocio en el formulario de la campaña, ver
// dashboard/[tenantSlug]/marketing/new) — se escapa y se convierte cada
// salto de línea en un párrafo antes de mandar. Siempre lleva el pie de
// baja: es requisito básico de cualquier envío masivo de email, no opcional.
export async function sendMarketingCampaignEmail(
  to: string,
  subject: string,
  body: string,
  unsubscribeUrl: string
): Promise<{ ok: true; messageId: null } | { ok: false; error: string }> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const bodyHtml = body
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
      .join("\n");

    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "RIME <onboarding@resend.dev>",
      to,
      subject,
      html: `
        ${bodyHtml}
        <hr style="margin-top: 24px; border: none; border-top: 1px solid #E5E7EB;" />
        <p style="font-size: 12px; color: #6B7280;">
          <a href="${unsubscribeUrl}">Darte de baja</a> de estas novedades.
        </p>
      `,
    });
    return { ok: true, messageId: null };
  } catch (error) {
    console.error("Error enviando email de campaña de marketing", error);
    return { ok: false, error: error instanceof Error ? error.message : "Error desconocido" };
  }
}
