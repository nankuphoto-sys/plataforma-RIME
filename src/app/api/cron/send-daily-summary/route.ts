import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyStaff } from "@/lib/staffNotifications";

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

  // Un solo horario fijo en UTC (igual que el resto de los crons de este
  // proyecto, ver vercel.json) en vez de resolver el "hoy" por timezone de
  // cada sede — la franja horaria exacta del resumen es secundaria frente a
  // que el número de citas sea correcto.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  // Solo vale la pena consultar citas de los tenants que de verdad tienen
  // alguien suscrito a este resumen — distinct evita mandar la misma query
  // dos veces si dos usuarios del mismo negocio lo tienen activado.
  const tenantsWithSubscribers = await prisma.pushSubscription.findMany({
    where: { user: { notifyDailySummary: true } },
    distinct: ["tenantId"],
    select: { tenantId: true },
  });

  let notified = 0;

  for (const { tenantId } of tenantsWithSubscribers) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    if (!tenant) continue;

    const appointmentsToday = await prisma.appointment.count({
      where: { tenantId, startsAt: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } },
    });

    const body =
      appointmentsToday === 0
        ? "No tienes citas agendadas para hoy."
        : `Hoy tienes ${appointmentsToday} cita${appointmentsToday === 1 ? "" : "s"} agendada${appointmentsToday === 1 ? "" : "s"}.`;

    await notifyStaff(tenantId, "notifyDailySummary", {
      title: "Resumen del día",
      body,
      url: `/dashboard/${tenant.slug}/agenda`,
    });
    notified += 1;
  }

  return NextResponse.json({ tenantsNotified: notified });
}
