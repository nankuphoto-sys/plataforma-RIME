import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chargeTenantWompiSubscription } from "@/lib/wompiSubscriptionCharge";

// El query param `secret` es solo para poder probar el endpoint a mano desde
// el navegador en desarrollo local, donde no hay un cron real invocándolo.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const due = await prisma.tenant.findMany({
    where: {
      wompiPaymentSourceId: { not: null },
      wompiNextChargeAt: { lte: new Date() },
    },
  });

  let charged = 0;
  let skipped = 0;
  let failed = 0;

  for (const tenant of due) {
    // Si ya hay un cobro PENDING para este tenant (cron reintentado por
    // Vercel mientras el anterior seguía en vuelo, o el webhook todavía no
    // resolvió la transacción previa), no disparamos un segundo cobro real
    // contra Wompi — wompiNextChargeAt solo lo avanza el webhook, así que sin
    // este chequeo un reintento del cron cobraría dos veces.
    const pendingCharge = await prisma.tenantWompiCharge.findFirst({
      where: { tenantId: tenant.id, status: "PENDING" },
    });
    if (pendingCharge) {
      skipped += 1;
      continue;
    }

    try {
      await chargeTenantWompiSubscription(tenant);
      charged += 1;
    } catch (error) {
      // Un tenant con error de red/API no debe frenar el cobro del resto del
      // lote — sin este catch, una excepción acá propagaba fuera del GET y
      // todos los tenants siguientes en `due` se quedaban sin cobrar en esta
      // corrida (recién se reintentarían cuando wompiNextChargeAt volviera a
      // cumplirse, días después).
      console.error(`[charge-wompi-subscriptions] fallo cobrando tenant ${tenant.id}:`, error);
      failed += 1;
    }
  }

  return NextResponse.json({ processed: due.length, charged, skipped, failed });
}
