import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";
import { normalizePhoneForWhatsapp } from "@/lib/whatsapp";
import { FOLLOWUP_COOLDOWN_DAYS, isClientInactive } from "@/lib/reengagement";
import { PLAN_LIMITS, planIncludesModule } from "@/lib/planLimits";

const MAX_CLIENTS_SCANNED = 200;

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
  const cooldownStart = new Date(now.getTime() - FOLLOWUP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  // Solo se escanean clientes de tenants cuyo plan incluye el módulo de
  // recompra — un tenant sin ese módulo no debe generar avisos ni contar
  // contra el resultado del cron.
  const reengagementEnabledPlans = (Object.keys(PLAN_LIMITS) as Plan[]).filter((plan) =>
    planIncludesModule(plan, "reengagement")
  );

  const clients = await prisma.client.findMany({
    where: { phone: { not: null }, tenant: { plan: { in: reengagementEnabledPlans } } },
    include: { tenant: true },
    take: MAX_CLIENTS_SCANNED,
  });

  let enqueued = 0;

  for (const client of clients) {
    const normalizedPhone = client.phone ? normalizePhoneForWhatsapp(client.phone) : null;
    if (!normalizedPhone) continue;

    const [lastCompletedAppointment, upcomingAppointment] = await Promise.all([
      prisma.appointment.findFirst({
        where: { clientId: client.id, status: "COMPLETED" },
        orderBy: { startsAt: "desc" },
        select: { startsAt: true },
      }),
      prisma.appointment.findFirst({
        where: { clientId: client.id, startsAt: { gte: now }, status: { not: "CANCELLED" } },
        select: { id: true },
      }),
    ]);

    const inactive = isClientInactive({
      lastCompletedAppointmentAt: lastCompletedAppointment?.startsAt ?? null,
      hasUpcomingAppointment: !!upcomingAppointment,
      now,
    });
    if (!inactive) continue;

    // No duplicar: ya hay un aviso esperando a enviarse, o ya se le mandó uno
    // dentro de la ventana de cooldown.
    const existingFollowUp = await prisma.notificationQueue.findFirst({
      where: {
        clientId: client.id,
        channel: "WHATSAPP",
        kind: "REENGAGEMENT_FOLLOWUP",
        OR: [{ status: "SCHEDULED" }, { status: "SENT", sentAt: { gte: cooldownStart } }],
      },
    });
    if (existingFollowUp) continue;

    await prisma.notificationQueue.create({
      data: {
        tenantId: client.tenantId,
        clientId: client.id,
        appointmentId: null,
        channel: "WHATSAPP",
        kind: "REENGAGEMENT_FOLLOWUP",
        status: "SCHEDULED",
        scheduledFor: now,
        payload: {
          to: normalizedPhone,
          clientName: client.name,
          tenantName: client.tenant.name,
        },
      },
    });
    enqueued += 1;
  }

  return NextResponse.json({ scanned: clients.length, enqueued });
}
