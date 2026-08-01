import type { Tenant } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateWompiIntegritySignature, getWompiApiBaseUrl } from "@/lib/wompi";
import { getWompiPriceInCents } from "@/lib/wompiSubscriptionPlans";

interface WompiCreateTransactionResponse {
  data?: { id: string; status: string };
}

// Lógica de cobro compartida entre el primer cobro (tokenize-callback) y el
// cron mensual (charge-wompi-subscriptions) — evita duplicarla en dos
// lugares. Solo dispara el cobro: el resultado final (aprobado/rechazado) lo
// resuelve exclusivamente el webhook, nunca de forma optimista acá (mismo
// principio que Stripe).
export async function chargeTenantWompiSubscription(tenant: Tenant): Promise<{ approved: boolean }> {
  if (!tenant.wompiPaymentSourceId) {
    return { approved: false };
  }

  const owner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, locationRoles: { some: { role: "OWNER" } } },
  });

  const reference = `wompi-sub-${tenant.id}-${Date.now()}`;
  const amountInCents = getWompiPriceInCents(tenant.plan);

  const signature = generateWompiIntegritySignature({
    reference,
    amountInCents,
    currency: "COP",
  });

  const charge = await prisma.tenantWompiCharge.create({
    data: {
      tenantId: tenant.id,
      amountInCents,
      currency: "COP",
      status: "PENDING",
      reference,
      attemptNumber: tenant.wompiRetryCount + 1,
    },
  });

  const response = await fetch(`${getWompiApiBaseUrl()}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
    },
    body: JSON.stringify({
      amount_in_cents: amountInCents,
      currency: "COP",
      customer_email: owner?.email ?? "",
      payment_source_id: tenant.wompiPaymentSourceId,
      // Requerido por Wompi para transacciones con tarjeta, incluso cobrando
      // sobre un payment_source ya guardado (confirmado contra la API real
      // de sandbox: sin esto responde 422 "No se especificó installments").
      payment_method: { installments: 1 },
      reference,
      signature,
    }),
  });

  const body = (await response.json()) as WompiCreateTransactionResponse;

  if (!response.ok || !body.data) {
    // No se pudo ni iniciar la transacción (error de red/API) — no confundir
    // con un rechazo del banco, que se resuelve vía webhook.
    await prisma.tenantWompiCharge.update({
      where: { id: charge.id },
      data: { status: "ERROR" },
    });
    return { approved: false };
  }

  await prisma.tenantWompiCharge.update({
    where: { id: charge.id },
    data: { wompiTransactionId: body.data.id },
  });

  // `approved` acá significa "la transacción se pudo iniciar", NO que Wompi
  // ya la haya aprobado — eso lo resuelve exclusivamente el webhook.
  return { approved: true };
}
