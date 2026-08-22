/**
 * Helper para notificar eventos a n8n desde el backend.
 *
 * Uso: se llama desde los webhooks de Stripe/Wompi cuando pasa algo que
 * debe disparar una automatización externa (Slack, WhatsApp interno, etc.)
 *
 * Diseño clave: si n8n falla o no está configurado (ej. en un entorno sin
 * N8N_WEBHOOK_URL, como producción antes de tener n8n desplegado), esto
 * NUNCA debe romper el webhook real de Stripe/Wompi — esos mueven plata
 * real y ya tienen su propio manejo de errores (ver logError en ambas
 * rutas). Por eso está envuelto en try/catch y pensado para llamarse sin
 * `await` (fire-and-forget) desde el call site.
 */

type N8nEvent = {
  event: string; // ej: "payment_failed"
  data: Record<string, unknown>;
};

export async function notifyN8n({ event, data }: N8nEvent): Promise<void> {
  const url = process.env.N8N_WEBHOOK_URL;

  // Sin URL configurada (ej. producción todavía sin n8n desplegado),
  // simplemente no hacemos nada.
  if (!url) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    // Solo logueamos. Un fallo acá nunca debe tumbar el webhook real.
    console.error("[n8n] No se pudo notificar el evento:", event, err);
  }
}
