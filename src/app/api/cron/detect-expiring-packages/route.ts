import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";
import { normalizePhoneForWhatsapp } from "@/lib/whatsapp";
import {
  PACKAGE_EXPIRATION_ALERT_COOLDOWN_DAYS,
  isPackageNearingExpiration,
} from "@/lib/packages";
import { PLAN_LIMITS, planIncludesModule } from "@/lib/planLimits";

const MAX_PACKAGES_SCANNED = 200;

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

  const now = new Date();
  const cooldownStart = new Date(
    now.getTime() - PACKAGE_EXPIRATION_ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  );

  // Solo se escanean paquetes de tenants cuyo plan incluye el módulo
  // "packages" — un tenant sin ese módulo no debe generar alertas ni contar
  // contra el resultado del cron, mismo criterio que detect-inactive-clients.
  const packagesEnabledPlans = (Object.keys(PLAN_LIMITS) as Plan[]).filter((plan) =>
    planIncludesModule(plan, "packages")
  );

  const packages = await prisma.sessionPackage.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { not: null },
      tenant: { plan: { in: packagesEnabledPlans } },
      client: { phone: { not: null } },
    },
    include: { client: true },
    take: MAX_PACKAGES_SCANNED,
  });

  let enqueued = 0;

  for (const pkg of packages) {
    const normalizedPhone = pkg.client.phone ? normalizePhoneForWhatsapp(pkg.client.phone) : null;
    if (!normalizedPhone) continue;

    const nearingExpiration = isPackageNearingExpiration({
      status: pkg.status,
      expiresAt: pkg.expiresAt,
      totalSessions: pkg.totalSessions,
      usedSessions: pkg.usedSessions,
      now,
    });
    if (!nearingExpiration) continue;

    // No duplicar: ya hay una alerta esperando a enviarse para ESTE paquete
    // puntual, o ya se le mandó una dentro de la ventana de cooldown — un
    // mismo cliente puede tener otro paquete distinto también por vencer, así
    // que el dedup es por packageId, no solo por clientId.
    const existingAlert = await prisma.notificationQueue.findFirst({
      where: {
        packageId: pkg.id,
        channel: "WHATSAPP",
        kind: "PACKAGE_EXPIRATION",
        OR: [{ status: "SCHEDULED" }, { status: "SENT", sentAt: { gte: cooldownStart } }],
      },
    });
    if (existingAlert) continue;

    await prisma.notificationQueue.create({
      data: {
        tenantId: pkg.tenantId,
        clientId: pkg.clientId,
        packageId: pkg.id,
        appointmentId: null,
        channel: "WHATSAPP",
        kind: "PACKAGE_EXPIRATION",
        status: "SCHEDULED",
        scheduledFor: now,
        payload: {
          to: normalizedPhone,
          clientName: pkg.client.name,
          remainingSessions: pkg.totalSessions - pkg.usedSessions,
          expiresAtLabel: pkg.expiresAt!.toLocaleDateString("es-CO", {
            day: "numeric",
            month: "long",
          }),
        },
      },
    });
    enqueued += 1;
  }

  return NextResponse.json({ scanned: packages.length, enqueued });
}
