import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushNotification, type PushNotificationPayload } from "@/lib/webPush";

// Los 4 eventos de negocio que el mockup (RIME Movil.dc.html, pantalla
// Cuenta) ya mostraba como toggles — ahora respaldados por un campo real en
// User (ver prisma/schema.prisma). Union literal en vez de `string` para que
// solo se pueda pasar un nombre de campo que de verdad existe.
export type StaffNotificationPreference =
  | "notifyNewAppointment"
  | "notifyAppointmentReminder"
  | "notifyLowStock"
  | "notifyDailySummary";

// Manda un push a todos los usuarios del tenant que tienen esta preferencia
// activada Y al menos una suscripción de navegador guardada — fire-and-forget,
// nunca lanza (sendPushNotification ya no lanza tampoco), mismo criterio que
// maybeSendLowStockAlerts/sendCommissionPaidEmail: un canal "mejor esfuerzo"
// nunca debe romper el flujo de negocio que lo dispara.
export async function notifyStaff(
  tenantId: string,
  preference: StaffNotificationPreference,
  payload: PushNotificationPayload
): Promise<void> {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { tenantId, user: { [preference]: true } as Prisma.UserWhereInput },
      select: { endpoint: true, p256dh: true, auth: true },
    });
    await Promise.all(subscriptions.map((subscription) => sendPushNotification(subscription, payload)));
  } catch (error) {
    console.error("Error mandando notificaciones push al staff", error);
  }
}
