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
