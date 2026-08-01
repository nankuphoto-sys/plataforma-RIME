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

  for (const tenant of due) {
    await chargeTenantWompiSubscription(tenant);
  }

  return NextResponse.json({ processed: due.length });
}
