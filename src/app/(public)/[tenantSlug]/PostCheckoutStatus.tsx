"use client";

import { useTransition } from "react";
import Link from "next/link";
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
  paymentProvider: "STRIPE" | "WOMPI" | null;
}

interface PostCheckoutStatusProps {
  tenantSlug: string;
  appointment: PostCheckoutAppointment;
  outcome: "success" | "cancelled";
}

function formatFullDateTime(iso: string, timezone: string): string {
  const label = new Date(iso).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });
  const time = new Date(iso).toLocaleTimeString("es-CL", {
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

  const details = (
    <dl className="mt-4 space-y-2 text-sm text-gray-700">
      <div>
        <dt className="font-medium">Servicio</dt>
        <dd>{appointment.serviceName}</dd>
      </div>
      <div>
        <dt className="font-medium">Profesional</dt>
        <dd>{appointment.professionalName}</dd>
      </div>
      <div>
        <dt className="font-medium">Sede</dt>
        <dd>{appointment.locationName}</dd>
      </div>
      <div>
        <dt className="font-medium">Fecha y hora</dt>
        <dd>{formatFullDateTime(appointment.startsAtIso, appointment.locationTimezone)}</dd>
      </div>
    </dl>
  );

  if (outcome === "cancelled") {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-800">Pago no completado</h2>
        <p className="mt-2 text-sm text-gray-700">
          Tu cita sigue reservada como pendiente de pago. Puedes intentar pagar de nuevo
          cuando quieras.
        </p>
        {details}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => handleRetryPayment("STRIPE")}
            disabled={isPending}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? "Redirigiendo..." : "Reintentar pago"}
          </button>
          <Link
            href={`/${tenantSlug}`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-white"
          >
            Volver a reservas
          </Link>
        </div>
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
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-semibold text-green-800">¡Pago confirmado!</h2>
        <p className="mt-2 text-sm text-gray-700">Tu cita quedó confirmada.</p>
        {details}
        <Link
          href={`/${tenantSlug}`}
          className="mt-6 inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-white"
        >
          Volver a reservas
        </Link>
      </div>
    );
  }

  if (appointment.paymentStatus === "FAILED") {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-800">El pago no pudo procesarse</h2>
        <p className="mt-2 text-sm text-gray-700">
          Tu cita sigue reservada como pendiente de pago. Puedes intentar pagar de nuevo
          cuando quieras.
        </p>
        {details}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => handleRetryPayment(appointment.paymentProvider ?? "STRIPE")}
            disabled={isPending}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? "Redirigiendo..." : "Reintentar pago"}
          </button>
          <Link
            href={`/${tenantSlug}`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-white"
          >
            Volver a reservas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-6">
      <h2 className="text-lg font-semibold text-blue-800">Estamos confirmando tu pago</h2>
      <p className="mt-2 text-sm text-gray-700">
        Tu pago se está procesando y estamos esperando la confirmación final. Esto suele
        tardar solo unos segundos — puedes actualizar esta página en un momento.
      </p>
      {details}
      <Link
        href={`/${tenantSlug}`}
        className="mt-6 inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-white"
      >
        Volver a reservas
      </Link>
    </div>
  );
}
