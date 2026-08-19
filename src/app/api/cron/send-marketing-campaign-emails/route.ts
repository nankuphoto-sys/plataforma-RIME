import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarketingCampaignEmail } from "@/lib/email";

// Más generoso que el MAX_BATCH_SIZE=50 del resto de los crons de
// NotificationQueue a propósito: los crons de este proyecto corren una vez
// por día (plan Hobby de Vercel — ver vercel.json), y una campaña de un
// negocio chico debería salir completa en la misma corrida en vez de
// goteando varios días. Una base más grande igual sale, solo que en más de
// una corrida — mismo trade-off que ya acepta el resto del proyecto.
const MAX_BATCH_SIZE = 300;

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
      channel: "EMAIL",
      kind: "MARKETING_CAMPAIGN",
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

    const result = await sendMarketingCampaignEmail(
      String(payload.to ?? ""),
      String(payload.subject ?? ""),
      String(payload.body ?? ""),
      String(payload.unsubscribeUrl ?? "")
    );

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
