"use server";

import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";

// requireDashboardAccess (no un guard más específico): activar/desactivar
// las notificaciones push del propio navegador es algo que cualquier
// usuario con acceso al dashboard puede hacer sobre su propia cuenta, sin
// distinción de rol ni de plan — no es un feature de negocio gateado, es
// una preferencia personal, mismo criterio que cambiar la contraseña propia
// en account/actions.ts.

interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Guarda (o actualiza, si el mismo endpoint ya existía) la suscripción push
// del navegador actual para el usuario de la sesión. `endpoint` es único
// por navegador/dispositivo — upsert por endpoint cubre tanto "primera vez
// que este navegador se suscribe" como "el browser rotó el endpoint y
// volvió a llamar a subscribe()", sin duplicar filas.
export async function subscribePushAction(
  tenantSlug: string,
  subscription: PushSubscriptionInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { ok: false, error: "La suscripción recibida no es válida." };
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId: session.user.id,
        tenantId: tenant.id,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        endpoint: subscription.endpoint,
        tenantId: tenant.id,
        userId: session.user.id,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("Error guardando suscripción push", error);
    return { ok: false, error: "No se pudieron activar las notificaciones. Intenta de nuevo." };
  }
}

// Borra la suscripción push de este navegador. Filtrada también por
// userId (no solo por endpoint, aunque endpoint ya es @unique) para que un
// usuario nunca pueda borrar, ni por error ni a propósito, la suscripción
// de otro solo por conocer o adivinar su endpoint.
export async function unsubscribePushAction(
  tenantSlug: string,
  endpoint: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session } = await requireDashboardAccess(tenantSlug);

  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: session.user.id },
    });
    return { ok: true };
  } catch (error) {
    console.error("Error borrando suscripción push", error);
    return { ok: false, error: "No se pudieron desactivar las notificaciones. Intenta de nuevo." };
  }
}
