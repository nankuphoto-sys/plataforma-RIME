import { prisma } from "@/lib/prisma";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/appointmentStatus";
import { getWompiApiBaseUrl } from "@/lib/wompi";

export type WompiTransactionStatus = "APPROVED" | "DECLINED" | "PENDING" | "VOIDED" | "ERROR";

// Aplica el estado de una transacción de Wompi al Payment correspondiente.
// Compartida entre el webhook (recibe el estado directo en el payload) y la
// página de retorno del checkout (lo obtiene consultando la API de Wompi).
export async function applyWompiTransactionStatus(
  reference: string,
  status: WompiTransactionStatus
): Promise<void> {
  const payment = await prisma.payment.findFirst({ where: { providerRef: reference } });
  // Puede ser de otro ambiente (dev/staging) apuntando a la misma cuenta de
  // Wompi — no hacemos fallar nada por esto.
  if (!payment) return;

  // Idempotencia: no volvemos a tocar un pago que ya quedó en estado terminal.
  if (payment.status === "PAID" || payment.status === "FAILED") return;

  if (status === "APPROVED") {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", confirmedAt: new Date() },
      });

      const appointment = await tx.appointment.findUnique({
        where: { id: payment.appointmentId },
      });

      if (appointment && ALLOWED_STATUS_TRANSITIONS[appointment.status].includes("CONFIRMED")) {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: "CONFIRMED" },
        });
      }
    });
    return;
  }

  if (status === "DECLINED" || status === "ERROR" || status === "VOIDED") {
    // No tocamos el estado de la cita: queda pendiente para que el staff la
    // revise manualmente, no construimos cancelación automática.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
  }

  // PENDING: no hacemos nada todavía.
}

interface WompiTransactionResponse {
  data?: { reference: string; status: WompiTransactionStatus };
}

// A diferencia del webhook, acá no confiamos en el `id` que viene en la URL
// de retorno: consultamos la API de Wompi para obtener el estado real de la
// transacción antes de actualizar cualquier cosa.
export async function confirmWompiTransactionById(transactionId: string): Promise<void> {
  const response = await fetch(`${getWompiApiBaseUrl()}/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}` },
    cache: "no-store",
  });
  if (!response.ok) return;

  const body = (await response.json()) as WompiTransactionResponse;
  if (!body.data) return;

  await applyWompiTransactionStatus(body.data.reference, body.data.status);
}
