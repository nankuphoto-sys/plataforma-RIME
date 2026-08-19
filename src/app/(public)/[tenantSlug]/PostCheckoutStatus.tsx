"use client";

import { useTransition } from "react";
import Link from "next/link";
import { AppointmentTicket } from "./AppointmentTicket";
import { createCheckoutSessionAction, createWompiCheckoutAction } from "./actions";

export interface PostCheckoutAppointment {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  serviceName: string;
  professionalName: string;
  locationName: string;
  locationTimezone: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | null;
  paymentProvider: "STRIPE" | "WOMPI" | "GIFT_CARD" | null;
}

interface PostCheckoutStatusProps {
  tenantSlug: string;
  appointment: PostCheckoutAppointment;
  outcome: "success" | "cancelled";
}

function formatFullDateTime(iso: string, timezone: string): string {
  const label = new Date(iso).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });
  const time = new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
  return `${label.charAt(0).toUpperCase() + label.slice(1)} a las ${time}`;
}

export function PostCheckoutStatus({
  tenantSlug,
  appointment,
  outcome,
}: PostCheckoutStatusProps) {
  const [isPending, startTransition] = useTransition();

  function handleRetryPayment(provider: "STRIPE" | "WOMPI") {
    startTransition(async () => {
      const result =
        provider === "STRIPE"
          ? await createCheckoutSessionAction(tenantSlug, appointment.id)
          : await createWompiCheckoutAction(tenantSlug, appointment.id);
      if (result.ok) {
        window.location.href = result.data.checkoutUrl;
      }
    });
  }

  const ticketProps = {
    serviceName: appointment.serviceName,
    professionalName: appointment.professionalName,
    locationName: appointment.locationName,
    dateTimeLabel: formatFullDateTime(appointment.startsAtIso, appointment.locationTimezone),
  };

  const backLink = (
    <Link href={`/${tenantSlug}`} className="shell-link inline-block">
      Volver a reservas
    </Link>
  );

  if (outcome === "cancelled") {
    return (
      <div className="mt-8">
        <AppointmentTicket
          {...ticketProps}
          variant="cancelled"
          message="Tu cita sigue reservada como pendiente de pago. Puedes intentar pagar de nuevo cuando quieras."
        >
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => handleRetryPayment("STRIPE")} disabled={isPending} className="btn-primary">
              {isPending ? "Redirigiendo…" : "Reintentar pago"}
            </button>
            {backLink}
          </div>
        </AppointmentTicket>
      </div>
    );
  }

  // outcome === "success": la pasarela redirigió acá, pero la fuente de
  // verdad del pago es el webhook (o, en el caso de Wompi, la confirmación
  // contra su API que ya se hizo antes de renderizar esta página) —
  // reflejamos el estado real de Payment, no asumimos que ya está confirmado
  // solo por haber llegado a esta URL.
  if (appointment.paymentStatus === "PAID") {
    return (
      <div className="mt-8">
        <AppointmentTicket {...ticketProps} variant="confirmed">
          {backLink}
        </AppointmentTicket>
      </div>
    );
  }

  if (appointment.paymentStatus === "FAILED") {
    return (
      <div className="mt-8">
        <AppointmentTicket
          {...ticketProps}
          variant="failed"
          message="Tu cita sigue reservada como pendiente de pago. Puedes intentar pagar de nuevo cuando quieras."
        >
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() =>
                handleRetryPayment(appointment.paymentProvider === "WOMPI" ? "WOMPI" : "STRIPE")
              }
              disabled={isPending}
              className="btn-primary"
            >
              {isPending ? "Redirigiendo…" : "Reintentar pago"}
            </button>
            {backLink}
          </div>
        </AppointmentTicket>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <AppointmentTicket
        {...ticketProps}
        variant="processing"
        message="Tu pago se está procesando y estamos esperando la confirmación final. Esto suele tardar solo unos segundos — puedes actualizar esta página en un momento."
      >
        {backLink}
      </AppointmentTicket>
    </div>
  );
}
