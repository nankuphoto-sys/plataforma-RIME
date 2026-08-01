import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWompiWebhookChecksum } from "@/lib/wompi";
import { applyWompiTransactionStatus, type WompiTransactionStatus } from "@/lib/wompiPayment";

interface WompiWebhookEvent {
  event: string;
  data: {
    transaction: {
      id: string;
      reference: string;
      status: WompiTransactionStatus;
      amount_in_cents: number;
      currency: string;
    };
  };
  environment: string;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  sent_at: string;
}

// Reintentos: hasta 3, a +2/+4/+7 días desde el primer rechazo del ciclo.
const RETRY_OFFSET_DAYS = [2, 4, 7];
const MAX_RETRIES = 3;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// El status crudo de Wompi (WompiTransactionStatus) incluye PENDING/VOIDED,
// que no forman parte de WompiChargeStatus (PENDING/APPROVED/DECLINED/ERROR)
// salvo PENDING. VOIDED es inusual para un cobro de suscripción recién
// creado — se mapea a ERROR para no dejarlo sin resolver.
function toChargeStatus(status: WompiTransactionStatus): "PENDING" | "APPROVED" | "DECLINED" | "ERROR" {
  if (status === "PENDING") return "PENDING";
  if (status === "APPROVED") return "APPROVED";
  if (status === "DECLINED") return "DECLINED";
  return "ERROR";
}

// Cobro de la suscripción del SaaS vía Wompi (TenantWompiCharge) — separado
// de Payment/Appointment. Solo corre cuando la referencia del evento NO
// matchea ningún Payment (pagos de citas de clientes finales), para no
// interferir con esa rama existente.
async function handleSubscriptionChargeUpdate(reference: string, rawStatus: WompiTransactionStatus): Promise<void> {
  const charge = await prisma.tenantWompiCharge.findUnique({ where: { reference } });
  // Puede ser un evento de otro ambiente (dev/staging) apuntando a la misma
  // cuenta de Wompi — no hacemos fallar el webhook por esto.
  if (!charge) return;

  const chargeStatus = toChargeStatus(rawStatus);

  // Idempotencia: no volvemos a tocar un cobro que ya quedó en estado terminal.
  if (charge.status === "APPROVED" || charge.status === "DECLINED" || charge.status === "ERROR") {
    return;
  }

  await prisma.tenantWompiCharge.update({
    where: { id: charge.id },
    data: {
      status: chargeStatus,
      confirmedAt: chargeStatus === "PENDING" ? null : new Date(),
    },
  });

  if (chargeStatus === "PENDING") return;

  const tenant = await prisma.tenant.findUnique({ where: { id: charge.tenantId } });
  if (!tenant) return;

  if (chargeStatus === "APPROVED") {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: "ACTIVE",
        wompiNextChargeAt: addDays(new Date(), 30),
        wompiRetryCount: 0,
        wompiFirstFailedAt: null,
      },
    });
    return;
  }

  // DECLINED o ERROR.
  if (tenant.wompiRetryCount >= MAX_RETRIES) {
    // Este envío corresponde al último reintento ya agotado.
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "CANCELLED", wompiNextChargeAt: null },
    });
    return;
  }

  const nextRetryCount = tenant.wompiRetryCount + 1;
  const firstFailedAt = tenant.wompiFirstFailedAt ?? new Date();
  const offsetDays = RETRY_OFFSET_DAYS[nextRetryCount - 1];

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      status: "PAST_DUE",
      wompiRetryCount: nextRetryCount,
      wompiFirstFailedAt: firstFailedAt,
      wompiNextChargeAt: addDays(firstFailedAt, offsetDays),
    },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
  if (!eventsSecret) {
    return NextResponse.json({ error: "Webhook no configurado." }, { status: 500 });
  }

  let event: WompiWebhookEvent;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const checksumIsValid = verifyWompiWebhookChecksum({
    data: event.data,
    timestamp: event.timestamp,
    signature: event.signature,
  });

  if (!checksumIsValid) {
    // Checksum inválido: no procesar nada — podría ser una petición falsificada.
    return NextResponse.json({ error: "Checksum inválido." }, { status: 400 });
  }

  if (event.event !== "transaction.updated") {
    return NextResponse.json({ received: true });
  }

  const { reference, status } = event.data.transaction;

  const payment = await prisma.payment.findFirst({ where: { providerRef: reference } });
  if (payment) {
    await applyWompiTransactionStatus(reference, status);
  } else {
    await handleSubscriptionChargeUpdate(reference, status);
  }

  return NextResponse.json({ received: true });
}
