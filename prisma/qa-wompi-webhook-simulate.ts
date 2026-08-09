// Script de QA descartable — simula la ENTREGA del webhook de Wompi para un
// cobro de suscripción del SaaS (TenantWompiCharge), consultando primero el
// estado REAL de la transacción contra la API de Wompi (sandbox). Solo el
// último tramo (Wompi -> nuestro servidor) es simulado, porque en local no
// hay un túnel público (ngrok) recibiendo webhooks reales — mismo criterio ya
// usado en la verificación original de "Cobro recurrente vía Wompi" (ver
// CLAUDE.md): "checksum HMAC real con WOMPI_EVENTS_SECRET simulando el
// webhook porque no había túnel público recibiendo webhooks reales".
//
// El checksum se calcula con el WOMPI_EVENTS_SECRET real del .env, con el
// mismo algoritmo que verifyWompiWebhookChecksum (src/lib/wompi.ts) — no es
// un atajo que salte la verificación de firma, es una réplica fiel del
// formato real de evento de Wompi.
//
// Uso:
//   npx tsx prisma/qa-wompi-webhook-simulate.ts <tenantSlug>
//
// Requiere que `npm run dev` esté corriendo en localhost:3000.

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getWompiApiBaseUrl(): string {
  const isSandbox = (process.env.WOMPI_PRIVATE_KEY ?? "").startsWith("prv_test_");
  return isSandbox ? "https://sandbox.wompi.co/v1" : "https://production.wompi.co/v1";
}

interface WompiTransactionResponse {
  data?: { id: string; status: string; reference: string; amount_in_cents: number; currency: string };
}

async function main() {
  const tenantSlug = process.argv[2];
  if (!tenantSlug) {
    console.error("Uso: npx tsx prisma/qa-wompi-webhook-simulate.ts <tenantSlug>");
    process.exit(1);
  }

  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
  if (!eventsSecret) {
    console.error("Falta WOMPI_EVENTS_SECRET en el .env.");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    console.error(`No existe ningún tenant con slug "${tenantSlug}".`);
    process.exit(1);
  }

  const charge = await prisma.tenantWompiCharge.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });
  if (!charge) {
    console.error(`El tenant "${tenantSlug}" no tiene ningún TenantWompiCharge todavía.`);
    process.exit(1);
  }
  if (!charge.wompiTransactionId) {
    console.error(`El cobro más reciente (${charge.id}) no tiene wompiTransactionId — no se pudo ni iniciar contra Wompi.`);
    process.exit(1);
  }

  console.log(`Consultando estado real de la transacción ${charge.wompiTransactionId} en Wompi...`);
  const response = await fetch(`${getWompiApiBaseUrl()}/transactions/${charge.wompiTransactionId}`);
  const body = (await response.json()) as WompiTransactionResponse;
  if (!response.ok || !body.data) {
    console.error("No se pudo consultar la transacción en Wompi.", body);
    process.exit(1);
  }

  const { id, status, reference, amount_in_cents, currency } = body.data;
  console.log(`Estado real en Wompi: ${status} (referencia ${reference}).`);

  const timestamp = Math.floor(Date.now() / 1000);
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const concatenatedValues = `${id}${status}${amount_in_cents}`;
  const checksum = crypto
    .createHash("sha256")
    .update(`${concatenatedValues}${timestamp}${eventsSecret}`)
    .digest("hex");

  const event = {
    event: "transaction.updated",
    data: { transaction: { id, reference, status, amount_in_cents, currency } },
    environment: "test",
    signature: { properties, checksum },
    timestamp,
    sent_at: new Date().toISOString(),
  };

  const webhookResponse = await fetch("http://localhost:3000/api/webhooks/wompi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  console.log(`POST a /api/webhooks/wompi -> ${webhookResponse.status}`, await webhookResponse.json());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
