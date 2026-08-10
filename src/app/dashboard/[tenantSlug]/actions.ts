"use server";

import { revalidatePath } from "next/cache";
import type { AppointmentStatus } from "@prisma/client";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/appointmentStatus";
import { getRoleAtLocation, hasLocationAccess } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import { deductInventoryForCompletedAppointment, maybeSendLowStockAlerts } from "@/lib/inventory";
import { planIncludesModule } from "@/lib/planLimits";
import { findBestWaitlistMatch } from "@/lib/waitlist";
import { normalizePhoneForWhatsapp, sendWaitlistSlotOpenedWhatsAppMessage } from "@/lib/whatsapp";
import { computeFollowUpSlot, isAutoFollowUpVertical, isFollowUpSlotFree } from "@/lib/followUpScheduling";
import { generateRawReviewToken, hashReviewToken, REVIEW_TOKEN_TTL_DAYS } from "@/lib/reviewToken";

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
    include: { service: true, client: true },
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

  // Un rol PROFESSIONAL en la sede de esta cita solo puede cambiar el estado
  // de SUS PROPIAS citas — nunca las de un colega, aunque comparta sede.
  // OWNER/ADMIN/STAFF no pasan por este chequeo extra.
  if (getRoleAtLocation(roles, appointment.locationId) === "PROFESSIONAL") {
    const viewerProfessionalId = await getLinkedProfessionalId(session.user.id);
    if (appointment.professionalId !== viewerProfessionalId) {
      return { ok: false, error: "No tienes permisos sobre esta cita." };
    }
  }

  if (!ALLOWED_STATUS_TRANSITIONS[appointment.status].includes(nextStatus)) {
    return { ok: false, error: "Esa transición de estado no está permitida." };
  }

  // Una sola transacción por atomicidad (no por bloqueo): el descuento de
  // inventario y el match de lista de espera en sí nunca condicionan si la
  // cita cambia de estado o no — eso ya se decidió arriba, con las
  // validaciones de permisos y transición. Si el plan del tenant no incluye
  // el módulo correspondiente, ni se intenta (ni genera movimientos/avisos,
  // ni falla) — mismo criterio que detect-inactive-clients con "reengagement".
  const { lowStockCandidates, waitlistNotification } = await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: nextStatus },
    });

    let lowStockCandidates: Awaited<ReturnType<typeof deductInventoryForCompletedAppointment>> = [];
    if (nextStatus === "COMPLETED" && planIncludesModule(tenant.plan, "inventory")) {
      lowStockCandidates = await deductInventoryForCompletedAppointment(tx, {
        serviceId: appointment.serviceId,
        locationId: appointment.locationId,
        appointmentId: appointment.id,
        performedByUserId: session.user.id,
      });
    }

    // Auto-agendar control de seguimiento: solo para verticales de salud
    // (ver isAutoFollowUpVertical) y solo si el horario exacto candidato
    // (mismo profesional/servicio, FOLLOW_UP_INTERVAL_DAYS después, mismo
    // horario del día) está libre — nunca elige otro horario ni fuerza un
    // doble-booking. Si no está libre, no se crea nada: el staff agenda a
    // mano, igual que siempre.
    if (nextStatus === "COMPLETED" && isAutoFollowUpVertical(tenant.vertical)) {
      const candidate = computeFollowUpSlot(appointment.startsAt, appointment.service.durationMinutes);

      const overlapping = await tx.appointment.findMany({
        where: {
          professionalId: appointment.professionalId,
          status: { not: "CANCELLED" },
          startsAt: { lt: candidate.endsAt },
          endsAt: { gt: candidate.startsAt },
        },
        select: { startsAt: true, endsAt: true },
      });

      if (isFollowUpSlotFree(candidate, overlapping)) {
        await tx.appointment.create({
          data: {
            tenantId: tenant.id,
            locationId: appointment.locationId,
            professionalId: appointment.professionalId,
            serviceId: appointment.serviceId,
            clientId: appointment.clientId,
            startsAt: candidate.startsAt,
            endsAt: candidate.endsAt,
            status: "PENDING",
            source: "AUTO_FOLLOWUP",
          },
        });
      }
    }

    // Invitación a dejar reseña: solo si el cliente tiene un canal por el
    // que contactarlo (email tiene prioridad — evita mandar los dos por la
    // misma cita) y solo si no se creó ya una para esta cita (una persona
    // puede pasar por COMPLETED más de una vez si el estado se corrige a
    // mano). El token crudo viaja en NotificationQueue.payload para que el
    // cron arme el link recién al enviar de verdad — ver src/lib/reviewToken.ts.
    if (nextStatus === "COMPLETED" && (appointment.client.email || appointment.client.phone)) {
      const existingReview = await tx.review.findUnique({ where: { appointmentId: appointment.id } });
      if (!existingReview) {
        const rawToken = generateRawReviewToken();
        const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/resena?token=${rawToken}`;
        const channel = appointment.client.email ? "EMAIL" : "WHATSAPP";

        await tx.review.create({
          data: {
            tenantId: tenant.id,
            appointmentId: appointment.id,
            clientId: appointment.clientId,
            tokenHash: hashReviewToken(rawToken),
            expiresAt: new Date(Date.now() + REVIEW_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });

        await tx.notificationQueue.create({
          data: {
            tenantId: tenant.id,
            appointmentId: appointment.id,
            clientId: appointment.clientId,
            channel,
            kind: "REVIEW_REQUEST",
            scheduledFor: new Date(),
            payload: {
              reviewUrl,
              clientName: appointment.client.name,
              tenantName: tenant.name,
              to: channel === "EMAIL" ? appointment.client.email : normalizePhoneForWhatsapp(appointment.client.phone!),
            },
          },
        });
      }
    }

    // Fidelidad con sellos: 100% automático a diferencia de paquetes de
    // sesiones (ver comentario en schema.prisma) porque acá no hay
    // ambigüedad — un solo contador corriendo por cliente/negocio, sin
    // selector de "a cuál aplicar". Sin aviso al cliente a propósito (el
    // conteo vive solo en el dashboard, decisión explícita del usuario).
    if (
      nextStatus === "COMPLETED" &&
      tenant.loyaltyEnabled &&
      planIncludesModule(tenant.plan, "loyalty")
    ) {
      await tx.client.update({
        where: { id: appointment.clientId },
        data: { loyaltyStamps: { increment: 1 } },
      });
    }

    // Lista de espera inteligente: al cancelar, se libera un cupo — se le
    // ofrece al candidato que matchea y espera hace más tiempo (nunca a
    // todos a la vez). Solo se consideran candidatos con teléfono válido —
    // si no se les puede avisar, no tiene sentido "gastar" el match con
    // ellos ni marcarlos NOTIFIED sin haberlos notificado de verdad.
    let waitlistNotification: {
      to: string;
      clientName: string;
      serviceName: string;
      startsAt: Date;
    } | null = null;
    if (nextStatus === "CANCELLED" && planIncludesModule(tenant.plan, "waitlist")) {
      const waitingEntries = await tx.waitlistEntry.findMany({
        where: {
          tenantId: tenant.id,
          locationId: appointment.locationId,
          serviceId: appointment.serviceId,
          status: "WAITING",
        },
        include: { client: true },
      });

      const candidatesWithPhone = waitingEntries
        .map((entry) => ({ entry, normalizedPhone: entry.client.phone ? normalizePhoneForWhatsapp(entry.client.phone) : null }))
        .filter((c): c is typeof c & { normalizedPhone: string } => c.normalizedPhone !== null);

      const bestMatch = findBestWaitlistMatch(
        candidatesWithPhone.map((c) => c.entry),
        {
          locationId: appointment.locationId,
          serviceId: appointment.serviceId,
          professionalId: appointment.professionalId,
          startsAt: appointment.startsAt,
        }
      );

      if (bestMatch) {
        await tx.waitlistEntry.update({
          where: { id: bestMatch.id },
          data: { status: "NOTIFIED", notifiedAt: new Date() },
        });
        const matchedCandidate = candidatesWithPhone.find((c) => c.entry.id === bestMatch.id)!;
        waitlistNotification = {
          to: matchedCandidate.normalizedPhone,
          clientName: matchedCandidate.entry.client.name,
          serviceName: appointment.service.name,
          startsAt: appointment.startsAt,
        };
      }
    }

    return { lowStockCandidates, waitlistNotification };
  });

  revalidatePath(`/dashboard/${tenantSlug}`);

  // Fuera de la transacción a propósito — un envío de WhatsApp nunca debe
  // vivir dentro de una transacción de base de datos. Fire-and-forget: no
  // bloquea la respuesta de la acción ni revierte nada si falla.
  if (lowStockCandidates.length > 0) {
    void maybeSendLowStockAlerts(lowStockCandidates);
  }
  if (waitlistNotification) {
    void sendWaitlistSlotOpenedWhatsAppMessage({
      to: waitlistNotification.to,
      clientName: waitlistNotification.clientName,
      serviceName: waitlistNotification.serviceName,
      startsAtLabel: waitlistNotification.startsAt.toLocaleString("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    });
  }

  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
