"use server";

import { revalidatePath } from "next/cache";
import type { AppointmentStatus } from "@prisma/client";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/appointmentStatus";
import { hasLocationAccess } from "@/lib/authorization";
import { deductInventoryForCompletedAppointment } from "@/lib/inventory";
import { planIncludesModule } from "@/lib/planLimits";

export interface UpdateAppointmentStatusResult {
  ok: boolean;
  error?: string;
}

export async function updateAppointmentStatusAction(
  tenantSlug: string,
  appointmentId: string,
  nextStatus: AppointmentStatus
): Promise<UpdateAppointmentStatusResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Debes iniciar sesión." };

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado." };
  if (session.user.tenantId !== tenant.id) {
    return { ok: false, error: "No tienes acceso a este negocio." };
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: tenant.id },
  });
  if (!appointment) return { ok: false, error: "Cita no encontrada." };

  // Nunca confiar en que la sesión del cliente (JWT) o la UI ya filtraron
  // esto: se revalida el permiso sobre la location de ESTA cita puntual
  // contra la base de datos, no contra session.user.locationRoles.
  const roles = await prisma.staffLocationRole.findMany({
    where: { userId: session.user.id },
    select: { locationId: true, role: true },
  });
  if (!hasLocationAccess(roles, appointment.locationId)) {
    return { ok: false, error: "No tienes permisos sobre la sede de esta cita." };
  }

  if (!ALLOWED_STATUS_TRANSITIONS[appointment.status].includes(nextStatus)) {
    return { ok: false, error: "Esa transición de estado no está permitida." };
  }

  // Una sola transacción por atomicidad (no por bloqueo): el descuento de
  // inventario en sí nunca condiciona si la cita se completa o no — eso ya
  // se decidió arriba, con las validaciones de permisos y transición. Si el
  // plan del tenant no incluye "inventory", el descuento ni se intenta (ni
  // genera movimientos, ni falla) — mismo criterio que detect-inactive-clients
  // con el módulo "reengagement".
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: nextStatus },
    });

    if (nextStatus === "COMPLETED" && planIncludesModule(tenant.plan, "inventory")) {
      await deductInventoryForCompletedAppointment(tx, {
        serviceId: appointment.serviceId,
        locationId: appointment.locationId,
        appointmentId: appointment.id,
        performedByUserId: session.user.id,
      });
    }
  });

  revalidatePath(`/dashboard/${tenantSlug}`);

  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
