import type { ReactNode } from "react";
import { Check, Clock, Loader2, TriangleAlert } from "lucide-react";

export type TicketVariant = "confirmed" | "pending" | "processing" | "failed" | "cancelled";

interface AppointmentTicketProps {
  variant: TicketVariant;
  serviceName: string;
  professionalName: string;
  locationName: string;
  dateTimeLabel: string;
  message?: string;
  children?: ReactNode; // acciones (botones de pago, reintentar, volver)
}

const VARIANT_CONFIG: Record<
  TicketVariant,
  { eyebrow: string; headline: string; seal: "pine" | "gold" | "berry"; icon: ReactNode }
> = {
  confirmed: {
    eyebrow: "Cita confirmada",
    headline: "¡Nos vemos pronto!",
    seal: "pine",
    icon: <Check className="h-6 w-6" strokeWidth={2.5} />,
  },
  pending: {
    eyebrow: "Cita reservada",
    headline: "Falta un paso: el pago",
    seal: "gold",
    icon: <Clock className="h-6 w-6" strokeWidth={2.5} />,
  },
  processing: {
    eyebrow: "Cita reservada",
    headline: "Confirmando tu pago…",
    seal: "gold",
    icon: <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.5} />,
  },
  failed: {
    eyebrow: "Cita reservada",
    headline: "El pago no pudo procesarse",
    seal: "berry",
    icon: <TriangleAlert className="h-6 w-6" strokeWidth={2.5} />,
  },
  cancelled: {
    eyebrow: "Cita reservada",
    headline: "Pago no completado",
    seal: "berry",
    icon: <TriangleAlert className="h-6 w-6" strokeWidth={2.5} />,
  },
};

const SEAL_CLASSES: Record<"pine" | "gold" | "berry", string> = {
  pine: "bg-pine text-paper ring-pine/20",
  gold: "bg-gold text-paper ring-gold/20",
  berry: "bg-berry text-paper ring-berry/20",
};

// El boleto de la cita: usado tanto en la confirmación inline del wizard
// (recién creada, antes de pagar) como en PostCheckoutStatus (después de
// volver de Stripe/Wompi) — mismo componente para que ambos momentos se
// vean como la misma pieza de producto, no dos pantallas distintas.
export function AppointmentTicket({
  variant,
  serviceName,
  professionalName,
  locationName,
  dateTimeLabel,
  message,
  children,
}: AppointmentTicketProps) {
  const config = VARIANT_CONFIG[variant];

  return (
    <div className="ticket">
      <div className="ticket-stub flex items-center gap-4">
        <div className={`ticket-seal ${SEAL_CLASSES[config.seal]}`}>{config.icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">{config.eyebrow}</p>
          <h2 className="font-display text-xl font-semibold text-ink">{config.headline}</h2>
        </div>
      </div>

      <div className="ticket-perforation" />

      <dl className="ticket-details grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Servicio</dt>
          <dd className="mt-0.5 font-medium text-ink">{serviceName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Profesional</dt>
          <dd className="mt-0.5 font-medium text-ink">{professionalName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Sede</dt>
          <dd className="mt-0.5 font-medium text-ink">{locationName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Fecha y hora</dt>
          <dd className="data-mono mt-0.5 font-medium text-ink">{dateTimeLabel}</dd>
        </div>
      </dl>

      {message && <p className="px-6 pb-2 text-sm text-ink/60">{message}</p>}

      {children && <div className="border-t border-sage-dark/25 bg-sage/20 p-6">{children}</div>}
    </div>
  );
}
