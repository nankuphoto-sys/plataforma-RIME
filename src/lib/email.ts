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
