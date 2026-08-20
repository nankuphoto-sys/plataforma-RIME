import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp";
import { notifyStaff } from "@/lib/staffNotifications";

const MAX_BATCH_SIZE = 50;

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

  const due = await prisma.notificationQueue.findMany({
    where: {
      channel: "WHATSAPP",
      kind: "APPOINTMENT_REMINDER",
      status: "SCHEDULED",
      scheduledFor: { lte: new Date() },
    },
    include: { appointment: true, tenant: { select: { slug: true } } },
    take: MAX_BATCH_SIZE,
    orderBy: { scheduledFor: "asc" },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notification of due) {
    // Reclamo atómico antes de mandar nada: si el cron se solapó con otra
    // corrida (reintento de Vercel por timeout, o el endpoint invocado dos
    // veces), la segunda corrida encuentra esta fila ya en SENDING (no
    // SCHEDULED), no la reclama, y no manda el mismo WhatsApp dos veces.
    const claim = await prisma.notificationQueue.updateMany({
      where: { id: notification.id, status: "SCHEDULED" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) {
      skipped += 1;
      continue;
    }

    const payload = (notification.payload ?? {}) as Record<string, unknown>;

    if (!notification.appointment || notification.appointment.status === "CANCELLED") {
      await prisma.notificationQueue.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          payload: { ...payload, error: "appointment_cancelled_or_missing" },
        },
      });
      failed += 1;
      continue;
    }

    const result = await sendWhatsAppTemplateMessage({
      to: String(payload.to ?? ""),
      clientName: String(payload.clientName ?? ""),
      serviceName: String(payload.serviceName ?? ""),
      startsAtLabel: String(payload.startsAtLabel ?? ""),
    });

    if (result.ok) {
      await prisma.notificationQueue.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          payload: { ...payload, messageId: result.messageId },
        },
      });
      sent += 1;

      // Push al staff, mismo evento que el WhatsApp que le acaba de llegar
      // al cliente — fire-and-forget, no debe frenar el resto del batch.
      void notifyStaff(notification.tenantId, "notifyAppointmentReminder", {
        title: "Recordatorio de cita mañana",
        body: `${String(payload.clientName ?? "")} — ${String(payload.serviceName ?? "")}, ${String(payload.startsAtLabel ?? "")}`,
        url: `/dashboard/${notification.tenant.slug}/agenda`,
      });
    } else {
      await prisma.notificationQueue.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          payload: { ...payload, error: result.error },
        },
      });
      failed += 1;
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed, skipped });
}
