import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReviewInviteWhatsAppMessage } from "@/lib/whatsapp";
import { sendReviewInviteEmail } from "@/lib/email";

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

// A diferencia de los demás crons de NotificationQueue (todos un solo
// channel fijo), este consume kind: REVIEW_REQUEST sin filtrar channel y
// despacha por WhatsApp o email según lo que se decidió al encolar en
// updateAppointmentStatusAction (email tiene prioridad ahí).
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const due = await prisma.notificationQueue.findMany({
    where: {
      kind: "REVIEW_REQUEST",
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

    const result =
      notification.channel === "EMAIL"
        ? await sendReviewInviteEmail(
            String(payload.to ?? ""),
            String(payload.reviewUrl ?? ""),
            String(payload.tenantName ?? "")
          )
        : await sendReviewInviteWhatsAppMessage({
            to: String(payload.to ?? ""),
            clientName: String(payload.clientName ?? ""),
            tenantName: String(payload.tenantName ?? ""),
            reviewUrl: String(payload.reviewUrl ?? ""),
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
