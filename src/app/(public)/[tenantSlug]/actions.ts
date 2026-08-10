"use server";

import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { generateWompiIntegritySignature } from "@/lib/wompi";
import { normalizePhoneForWhatsapp } from "@/lib/whatsapp";
import { computeReminderScheduledFor, formatAppointmentDateTimeLabel } from "@/lib/reminderScheduling";
import { computeChargeAmount } from "@/lib/depositPolicy";
import { computeRedemptionAmount, isGiftCardRedeemable } from "@/lib/giftCards";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/appointmentStatus";
import {
  generateAvailableSlots,
  getDayBoundsUtc,
  type CalendarDate,
} from "@/lib/availability";

// Cuánto queda por cobrar de verdad después de restar lo que ya cubrió una
// gift card aplicada a esta cita (ver applyGiftCardAction) — el checkout de
// Stripe/Wompi siempre debe cobrar el remanente, nunca el precio completo.
async function getRemainingAmountAfterGiftCard(appointmentId: string, baseAmount: string): Promise<string> {
  const redemption = await prisma.giftCardRedemption.findUnique({ where: { appointmentId } });
  if (!redemption) return baseAmount;
  const remaining = Math.max(0, Number(baseAmount) - Number(redemption.amountApplied));
  return remaining.toFixed(2);
}

// TODO: esto es una conversión de referencia fija, no una tasa de cambio real.
// Cuando el modelo de precios soporte multi-moneda por tenant, reemplazar esto.
const MOCK_USD_TO_COP_RATE = 4000;

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getAvailableSlotsAction(
  tenantSlug: string,
  locationId: string,
  professionalId: string,
  serviceId: string,
  date: CalendarDate
): Promise<ActionResult<{ slotsIso: string[] }>> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado." };

  const location = await prisma.location.findFirst({
    where: { id: locationId, tenantId: tenant.id },
  });
  if (!location) return { ok: false, error: "Sede no válida." };

  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId: tenant.id, active: true },
  });
  const professionalService = await prisma.professionalService.findUnique({
    where: { professionalId_serviceId: { professionalId, serviceId } },
  });
  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id, active: true },
  });

  if (!service || !professionalService || !professional) {
    return { ok: false, error: "El servicio o el profesional seleccionado no es válido." };
  }

  // Nunca confiar en que el cliente mandó una combinación válida solo porque
  // el wizard la filtró en el navegador: se revalida server-side.
  const professionalLocation = await prisma.professionalLocation.findUnique({
    where: { professionalId_locationId: { professionalId, locationId } },
  });
  if (!professionalLocation) {
    return { ok: false, error: "El profesional seleccionado no atiende en esa sede." };
  }

  const { start, end } = getDayBoundsUtc(date, location.timezone);
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { not: "CANCELLED" },
      startsAt: { gte: start, lt: end },
    },
    select: { startsAt: true, endsAt: true },
  });

  const slots = generateAvailableSlots({
    date,
    timezone: location.timezone,
    durationMinutes: service.durationMinutes,
    existingAppointments,
    now: new Date(),
  });

  return { ok: true, data: { slotsIso: slots.map((s) => s.toISOString()) } };
}

export interface CreateAppointmentInput {
  tenantSlug: string;
  locationId: string;
  professionalId: string;
  serviceId: string;
  startsAtIso: string;
  client: { name: string; email: string; phone: string };
  source?: "WEBSITE" | "MARKETPLACE";
}

export interface CreatedAppointment {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  serviceName: string;
  professionalName: string;
  locationName: string;
  locationTimezone: string;
}

export async function createAppointmentAction(
  input: CreateAppointmentInput
): Promise<ActionResult<CreatedAppointment>> {
  const name = input.client.name.trim();
  const email = input.client.email.trim();
  const phone = input.client.phone.trim();

  if (!name || !email || !phone) {
    return { ok: false, error: "Nombre, email y teléfono son obligatorios." };
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, error: "El email no tiene un formato válido." };
  }

  const startsAt = new Date(input.startsAtIso);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now()) {
    return { ok: false, error: "El horario seleccionado ya no está disponible." };
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: input.tenantSlug } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado." };

  const location = await prisma.location.findFirst({
    where: { id: input.locationId, tenantId: tenant.id },
  });
  if (!location) return { ok: false, error: "Sede no válida." };

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, tenantId: tenant.id, active: true },
  });
  if (!service) return { ok: false, error: "El servicio seleccionado no es válido." };

  const professionalService = await prisma.professionalService.findUnique({
    where: {
      professionalId_serviceId: { professionalId: input.professionalId, serviceId: input.serviceId },
    },
  });
  const professional = await prisma.professional.findFirst({
    where: { id: input.professionalId, tenantId: tenant.id, active: true },
  });
  if (!professionalService || !professional) {
    return { ok: false, error: "El profesional seleccionado no ofrece este servicio." };
  }

  // Nunca confiar en que el cliente mandó una combinación válida solo porque
  // el wizard la filtró en el navegador: se revalida server-side.
  const professionalLocation = await prisma.professionalLocation.findUnique({
    where: {
      professionalId_locationId: { professionalId: input.professionalId, locationId: input.locationId },
    },
  });
  if (!professionalLocation) {
    return { ok: false, error: "El profesional seleccionado no atiende en esa sede." };
  }

  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  try {
    const appointment = await prisma.$transaction(
      async (tx) => {
        // Revalida disponibilidad dentro de la transacción para evitar que dos
        // personas reserven el mismo horario al mismo tiempo.
        const overlapping = await tx.appointment.findFirst({
          where: {
            professionalId: input.professionalId,
            status: { not: "CANCELLED" },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        });
        if (overlapping) {
          throw new Error("SLOT_TAKEN");
        }

        const existingClient = await tx.client.findFirst({
          where: { tenantId: tenant.id, email },
        });

        const client =
          existingClient ??
          (await tx.client.create({
            data: { tenantId: tenant.id, name, email, phone },
          }));

        return tx.appointment.create({
          data: {
            tenantId: tenant.id,
            locationId: location.id,
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            clientId: client.id,
            startsAt,
            endsAt,
            status: "PENDING",
            source: input.source ?? "WEBSITE",
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    // Recordatorio por WhatsApp: fuera de la transacción (no hace falta esa
    // atomicidad), y solo si hay un teléfono válido y la cita es en 24h o más.
    const normalizedPhone = normalizePhoneForWhatsapp(phone);
    const reminderScheduledFor = computeReminderScheduledFor(startsAt, new Date());
    if (normalizedPhone && reminderScheduledFor) {
      await prisma.notificationQueue.create({
        data: {
          tenantId: tenant.id,
          appointmentId: appointment.id,
          channel: "WHATSAPP",
          kind: "APPOINTMENT_REMINDER",
          status: "SCHEDULED",
          scheduledFor: reminderScheduledFor,
          payload: {
            to: normalizedPhone,
            clientName: name,
            serviceName: service.name,
            startsAtLabel: formatAppointmentDateTimeLabel(startsAt, location.timezone),
          },
        },
      });
    }

    return {
      ok: true,
      data: {
        id: appointment.id,
        startsAtIso: appointment.startsAt.toISOString(),
        endsAtIso: appointment.endsAt.toISOString(),
        serviceName: service.name,
        professionalName: professional.name,
        locationName: location.name,
        locationTimezone: location.timezone,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return { ok: false, error: "Ese horario ya fue reservado. Por favor elige otro." };
    }
    throw err;
  }
}

// Construye la URL base del sitio a partir del header `host` de la petición
// actual, en vez de una constante — el puerto local cambia seguido en este
// proyecto (3000 suele quedar ocupado por un proceso anterior).
async function getBaseUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function createCheckoutSessionAction(
  tenantSlug: string,
  appointmentId: string
): Promise<ActionResult<{ checkoutUrl: string }>> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado." };

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: tenant.id },
    include: { service: true, payment: true },
  });
  if (!appointment) return { ok: false, error: "Cita no encontrada." };

  if (appointment.payment?.status === "PAID") {
    return { ok: false, error: "Esta cita ya fue pagada." };
  }

  const charge = computeChargeAmount(tenant, appointment.service.price);
  if (!charge) {
    return { ok: false, error: "Este negocio no requiere pago anticipado para reservar." };
  }

  const remainingAmount = await getRemainingAmountAfterGiftCard(appointment.id, charge.amount);
  if (Number(remainingAmount) <= 0) {
    return { ok: false, error: "Esta cita ya está cubierta por completo con una gift card." };
  }

  const payment =
    appointment.payment ??
    (await prisma.payment.create({
      data: {
        appointmentId: appointment.id,
        provider: "STRIPE",
        status: "PENDING",
        amount: remainingAmount,
        kind: charge.kind,
        // Fijo en USD por ahora: Mercado Pago se encargará de moneda local
        // (CLP, etc.) en una fase posterior.
        currency: "usd",
      },
    }));

  const baseUrl = await getBaseUrl();
  const amountInCents = Math.round(Number(remainingAmount) * 100);
  const productName =
    charge.kind === "DEPOSIT" ? `Seña — ${appointment.service.name}` : appointment.service.name;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: productName },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      appointmentId: appointment.id,
      tenantId: tenant.id,
    },
    success_url: `${baseUrl}/${tenantSlug}?appointment=${appointment.id}&payment=success`,
    cancel_url: `${baseUrl}/${tenantSlug}?appointment=${appointment.id}&payment=cancelled`,
  });

  if (!session.url) {
    return { ok: false, error: "No se pudo iniciar el pago. Intenta de nuevo." };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerRef: session.id },
  });

  return { ok: true, data: { checkoutUrl: session.url } };
}

export async function createWompiCheckoutAction(
  tenantSlug: string,
  appointmentId: string
): Promise<ActionResult<{ checkoutUrl: string }>> {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  if (!publicKey) return { ok: false, error: "Wompi no está configurado." };

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado." };

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: tenant.id },
    include: { service: true, payment: true },
  });
  if (!appointment) return { ok: false, error: "Cita no encontrada." };

  if (appointment.payment?.status === "PAID") {
    return { ok: false, error: "Esta cita ya fue pagada." };
  }

  const charge = computeChargeAmount(tenant, appointment.service.price);
  if (!charge) {
    return { ok: false, error: "Este negocio no requiere pago anticipado para reservar." };
  }

  const remainingAmount = await getRemainingAmountAfterGiftCard(appointment.id, charge.amount);
  if (Number(remainingAmount) <= 0) {
    return { ok: false, error: "Esta cita ya está cubierta por completo con una gift card." };
  }

  // Wompi no permite reutilizar una referencia ya usada: generamos una nueva
  // en cada intento de pago.
  const reference = `${appointment.id}-${Date.now()}`;
  const amountInCents = Math.round(Number(remainingAmount) * MOCK_USD_TO_COP_RATE * 100);

  if (appointment.payment) {
    await prisma.payment.update({
      where: { id: appointment.payment.id },
      data: {
        provider: "WOMPI",
        status: "PENDING",
        amount: remainingAmount,
        kind: charge.kind,
        currency: "COP",
        providerRef: reference,
      },
    });
  } else {
    await prisma.payment.create({
      data: {
        appointmentId: appointment.id,
        provider: "WOMPI",
        status: "PENDING",
        amount: remainingAmount,
        kind: charge.kind,
        currency: "COP",
        providerRef: reference,
      },
    });
  }

  const baseUrl = await getBaseUrl();
  const signature = generateWompiIntegritySignature({
    reference,
    amountInCents,
    currency: "COP",
  });

  const params = new URLSearchParams({
    "public-key": publicKey,
    currency: "COP",
    "amount-in-cents": String(amountInCents),
    reference,
    "signature:integrity": signature,
    "redirect-url": `${baseUrl}/${tenantSlug}?appointment=${appointment.id}&wompi=return`,
  });

  return { ok: true, data: { checkoutUrl: `https://checkout.wompi.co/p/?${params.toString()}` } };
}

export interface GiftCardApplied {
  amountApplied: string;
  remainingAmount: string;
  fullyCovered: boolean;
}

// Aplica una gift card a una cita antes de que el cliente elija cómo pagar
// el resto. Una sola vez por cita (GiftCardRedemption.appointmentId es
// @unique). Si cubre el 100%, confirma la cita ahí mismo — no hay checkout
// externo que dispare un webhook, así que replica a mano el mismo patrón de
// "Payment PAID → si la transición lo permite, confirmar" que usan los
// webhooks de Stripe/Wompi (ver ALLOWED_STATUS_TRANSITIONS).
export async function applyGiftCardAction(
  tenantSlug: string,
  appointmentId: string,
  rawCode: string
): Promise<ActionResult<GiftCardApplied>> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado." };

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: tenant.id },
    include: { service: true, payment: true, giftCardRedemption: true },
  });
  if (!appointment) return { ok: false, error: "Cita no encontrada." };

  if (appointment.payment?.status === "PAID") {
    return { ok: false, error: "Esta cita ya fue pagada." };
  }
  if (appointment.giftCardRedemption) {
    return { ok: false, error: "Ya aplicaste una gift card a esta cita." };
  }

  const charge = computeChargeAmount(tenant, appointment.service.price);
  if (!charge) {
    return { ok: false, error: "Este negocio no requiere pago anticipado para reservar." };
  }

  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Ingresá un código." };

  const giftCard = await prisma.giftCard.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code } },
  });
  if (!giftCard || !isGiftCardRedeemable(giftCard, new Date())) {
    return { ok: false, error: "Ese código de gift card no es válido." };
  }

  const amountApplied = computeRedemptionAmount(Number(giftCard.balance), Number(charge.amount));
  const remainingAmount = Math.max(0, Number(charge.amount) - amountApplied);
  const newBalance = Number(giftCard.balance) - amountApplied;

  await prisma.$transaction(async (tx) => {
    await tx.giftCard.update({
      where: { id: giftCard.id },
      data: { balance: newBalance, status: newBalance <= 0 ? "DEPLETED" : giftCard.status },
    });

    await tx.giftCardRedemption.create({
      data: { giftCardId: giftCard.id, appointmentId: appointment.id, amountApplied },
    });

    if (remainingAmount <= 0) {
      await tx.payment.create({
        data: {
          appointmentId: appointment.id,
          provider: "GIFT_CARD",
          status: "PAID",
          amount: charge.amount,
          kind: charge.kind,
          currency: "usd",
          confirmedAt: new Date(),
        },
      });

      if (ALLOWED_STATUS_TRANSITIONS[appointment.status].includes("CONFIRMED")) {
        await tx.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });
      }
    }
  });

  return {
    ok: true,
    data: {
      amountApplied: amountApplied.toFixed(2),
      remainingAmount: remainingAmount.toFixed(2),
      fullyCovered: remainingAmount <= 0,
    },
  };
}
