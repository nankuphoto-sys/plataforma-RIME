import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendFollowUpWhatsAppMessage } from "@/lib/whatsapp";

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
      kind: "REENGAGEMENT_FOLLOWUP",
      status: "SCHEDULED",
      scheduledFor: { lte: new Date() },
    },
    take: MAX_BATCH_SIZE,
    orderBy: { scheduledFor: "asc" },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notification of due) {
    // Reclamo atómico antes de mandar nada — ver el mismo comentario en
    // send-reminders/route.ts.
    const claim = await prisma.notificationQueue.updateMany({
      where: { id: notification.id, status: "SCHEDULED" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) {
      skipped += 1;
      continue;
    }

    const payload = (notification.payload ?? {}) as Record<string, unknown>;

    const result = await sendFollowUpWhatsAppMessage({
      to: String(payload.to ?? ""),
      clientName: String(payload.clientName ?? ""),
      tenantName: String(payload.tenantName ?? ""),
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
