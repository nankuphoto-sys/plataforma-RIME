import webpush, { WebPushError } from "web-push";
import { prisma } from "@/lib/prisma";

// Mismo criterio que src/lib/email.ts (Resend): setVapidDetails() tira si
// falta alguna de las tres variables, así que se llama de forma defensiva
// acá arriba (a nivel de módulo, a diferencia de Resend, porque acá no hay
// costo de instanciar un cliente por request — setVapidDetails solo guarda
// estos valores en el propio módulo "web-push"). Si faltan, sendNotification
// simplemente va a fallar más abajo con un error claro en vez de romper el
// import de este archivo.
const vapidSubject = process.env.VAPID_SUBJECT;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
}

// Códigos que el push service devuelve cuando una suscripción ya no sirve
// (usuario desinstaló la PWA, borró datos del navegador, revocó el permiso
// de notificaciones): reintentar no tiene sentido, va a seguir fallando
// igual. 410 Gone es el código estándar del spec de Web Push; 404 Not Found
// aparece en algunos push services (ej. FCM) para el mismo caso. Exportada
// aparte de sendPushNotification para poder testearla como función pura,
// sin mockear la red.
export function isExpiredSubscriptionError(error: unknown): boolean {
  return error instanceof WebPushError && (error.statusCode === 410 || error.statusCode === 404);
}

// Manda una notificación push a una suscripción guardada. Nunca lanza —
// mismo criterio que sendCommissionPaidEmail/sendPasswordResetEmail en
// src/lib/email.ts: quien llama a esto (ej. una Server Action o un cron) no
// debería romperse porque falló un envío de "mejor esfuerzo". Si la
// suscripción está caducada (410/404), de paso la borra de la tabla —
// dejarla ahí solo garantizaría el mismo error la próxima vez.
export async function sendPushNotification(
  subscription: StoredPushSubscription,
  payload: PushNotificationPayload
): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    );
  } catch (error) {
    if (isExpiredSubscriptionError(error)) {
      // deleteMany (no delete) para que esto siga sin lanzar aunque la fila
      // ya se haya borrado por otro camino mientras tanto (ej. el usuario
      // se desuscribió a mano justo antes de que corriera este envío).
      await prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
      return;
    }
    console.error("Error enviando notificación push", error);
  }
}
