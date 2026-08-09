"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import {
  getUpcomingBookableDates,
  type CalendarDate,
} from "@/lib/availability";
import { computeChargeAmount } from "@/lib/depositPolicy";
import { Chip } from "@/components/ui/Chip";
import { OptionCard } from "@/components/ui/OptionCard";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { AppointmentTicket } from "./AppointmentTicket";
import {
  createAppointmentAction,
  createCheckoutSessionAction,
  createWompiCheckoutAction,
  getAvailableSlotsAction,
  type CreatedAppointment,
} from "./actions";

// Agrupa los horarios sueltos bajo un segmentado Mañana/Tarde/Noche antes de
// mostrarlos como chips — reduce el scroll en servicios con muchos huecos,
// sobre los mismos slots que ya trae getAvailableSlotsAction (sin tocar datos).
type DayPart = "morning" | "afternoon" | "evening";

const DAY_PARTS: DayPart[] = ["morning", "afternoon", "evening"];
const DAY_PART_LABEL: Record<DayPart, string> = {
  morning: "Mañana",
  afternoon: "Tarde",
  evening: "Noche",
};

function slotDayPart(iso: string, timezone: string): DayPart {
  const hour = Number(
    new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", hourCycle: "h23", timeZone: timezone })
  );
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export interface BookingLocation {
  id: string;
  name: string;
  timezone: string;
}

export interface BookingService {
  id: string;
  name: string;
  durationMinutes: number;
  price: string;
}

export interface BookingProfessional {
  id: string;
  name: string;
  serviceIds: string[];
  locationIds: string[];
}

export interface BookingDepositPolicy {
  policy: "NONE" | "DEPOSIT" | "FULL_PAYMENT";
  type: "PERCENTAGE" | "FIXED" | null;
  value: string | null;
}

interface BookingWizardProps {
  tenantSlug: string;
  locations: BookingLocation[];
  services: BookingService[];
  professionals: BookingProfessional[];
  depositPolicy: BookingDepositPolicy;
}

type Step = "location" | "service" | "professional" | "datetime" | "client" | "confirmation";

function calendarDateKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function formatDateLabel(date: CalendarDate): string {
  const asUtcNoon = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
  const label = asUtcNoon.toLocaleDateString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatSlotTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
}

function formatFullDateTime(iso: string, timezone: string): string {
  const label = new Date(iso).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });
  const time = formatSlotTime(iso, timezone);
  return `${label.charAt(0).toUpperCase() + label.slice(1)} a las ${time}`;
}

// Fila de "volver" — mismo lenguaje que .shell-link del dashboard (flecha
// que se desliza levemente en hover), para que la agenda pública no se
// sienta como una pantalla aparte del resto del producto.
function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 text-sm text-ink/50 transition-colors hover:text-pine"
    >
      <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
      {children}
    </button>
  );
}

export function BookingWizard({
  tenantSlug,
  locations,
  services,
  professionals,
  depositPolicy,
}: BookingWizardProps) {
  const hasLocationStep = locations.length > 1;
  const defaultLocationId = locations.length === 1 ? locations[0].id : null;

  const [step, setStep] = useState<Step>(hasLocationStep ? "location" : "service");
  const [isPending, startTransition] = useTransition();

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(defaultLocationId);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [cameFromProfessionalStep, setCameFromProfessionalStep] = useState(false);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<CalendarDate | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null);
  const [dayPart, setDayPart] = useState<DayPart | null>(null);

  const [clientForm, setClientForm] = useState({ name: "", email: "", phone: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<CreatedAppointment | null>(null);
  const [noProfessionalsServiceId, setNoProfessionalsServiceId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? null;
  const locationTimezone = selectedLocation?.timezone ?? "UTC";

  const bookableDates = useMemo(
    () => getUpcomingBookableDates(locationTimezone),
    [locationTimezone]
  );

  const selectedService = services.find((s) => s.id === selectedServiceId) ?? null;
  const selectedProfessional =
    professionals.find((p) => p.id === selectedProfessionalId) ?? null;

  function resetAll() {
    setStep(hasLocationStep ? "location" : "service");
    setSelectedLocationId(defaultLocationId);
    setSelectedServiceId(null);
    setCameFromProfessionalStep(false);
    setSelectedProfessionalId(null);
    setSelectedDate(null);
    setSlots([]);
    setSlotsError(null);
    setSelectedSlotIso(null);
    setDayPart(null);
    setClientForm({ name: "", email: "", phone: "" });
    setFormError(null);
    setConfirmation(null);
    setNoProfessionalsServiceId(null);
    setCheckoutError(null);
  }

  function handleSelectLocation(locationId: string) {
    setSelectedLocationId(locationId);
    setStep("service");
  }

  function handleSelectService(serviceId: string) {
    const eligibleProfessionals = professionals.filter(
      (p) => p.serviceIds.includes(serviceId) && (!selectedLocationId || p.locationIds.includes(selectedLocationId))
    );
    setSelectedServiceId(serviceId);
    setNoProfessionalsServiceId(null);

    if (eligibleProfessionals.length === 0) {
      setSelectedProfessionalId(null);
      setNoProfessionalsServiceId(serviceId);
      return;
    }

    if (eligibleProfessionals.length === 1) {
      setSelectedProfessionalId(eligibleProfessionals[0].id);
      setCameFromProfessionalStep(false);
      setStep("datetime");
      return;
    }

    setCameFromProfessionalStep(true);
    setStep("professional");
  }

  function handleSelectProfessional(professionalId: string) {
    setSelectedProfessionalId(professionalId);
    setStep("datetime");
  }

  function handleSelectDate(date: CalendarDate) {
    if (!selectedLocationId || !selectedServiceId || !selectedProfessionalId) return;
    setSelectedDate(date);
    setSelectedSlotIso(null);
    setSlots([]);
    setSlotsError(null);
    setDayPart(null);

    startTransition(async () => {
      const result = await getAvailableSlotsAction(
        tenantSlug,
        selectedLocationId,
        selectedProfessionalId,
        selectedServiceId,
        date
      );
      if (!result.ok) {
        setSlotsError(result.error);
        return;
      }
      setSlots(result.data.slotsIso);
      if (result.data.slotsIso.length === 0) {
        setSlotsError("No quedan horarios disponibles para ese día.");
      } else {
        const firstAvailablePart = DAY_PARTS.find((part) =>
          result.data.slotsIso.some((iso) => slotDayPart(iso, locationTimezone) === part)
        );
        setDayPart(firstAvailablePart ?? null);
      }
    });
  }

  function handleSelectSlot(iso: string) {
    setSelectedSlotIso(iso);
    setStep("client");
  }

  function handleSubmitClient(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedLocationId || !selectedServiceId || !selectedProfessionalId || !selectedSlotIso) return;
    setFormError(null);
    setCheckoutError(null);

    startTransition(async () => {
      const result = await createAppointmentAction({
        tenantSlug,
        locationId: selectedLocationId,
        professionalId: selectedProfessionalId,
        serviceId: selectedServiceId,
        startsAtIso: selectedSlotIso,
        client: clientForm,
      });

      if (!result.ok) {
        setFormError(result.error);
        // El horario pudo haber sido tomado por otra persona: forzamos a
        // recargar la disponibilidad del día seleccionado.
        if (selectedDate) handleSelectDate(selectedDate);
        return;
      }

      setConfirmation(result.data);
      setStep("confirmation");
    });
  }

  function handlePay(provider: "stripe" | "wompi") {
    if (!confirmation) return;
    setCheckoutError(null);

    startTransition(async () => {
      const checkoutResult =
        provider === "stripe"
          ? await createCheckoutSessionAction(tenantSlug, confirmation.id)
          : await createWompiCheckoutAction(tenantSlug, confirmation.id);

      if (!checkoutResult.ok) {
        // La cita ya quedó creada (PENDING); dejamos ver el motivo por el que
        // no se pudo iniciar el pago para que puedan reintentar.
        setCheckoutError(checkoutResult.error);
        return;
      }

      window.location.href = checkoutResult.data.checkoutUrl;
    });
  }

  // Breadcrumb: un chip por paso ya resuelto, en el orden en que el flujo
  // real los pidió (la sede solo aparece si el negocio tiene más de una).
  const crumbs: { label: string; done: boolean }[] = [
    ...(hasLocationStep ? [{ label: selectedLocation?.name ?? "Sede", done: !!selectedLocationId }] : []),
    { label: selectedService?.name ?? "Servicio", done: !!selectedService },
    { label: selectedProfessional?.name ?? "Profesional", done: !!selectedProfessional },
    {
      label: selectedSlotIso ? formatSlotTime(selectedSlotIso, locationTimezone) : "Horario",
      done: !!selectedSlotIso,
    },
  ];

  if (step === "confirmation" && confirmation) {
    const charge = selectedService
      ? computeChargeAmount(
          {
            depositPolicy: depositPolicy.policy,
            depositType: depositPolicy.type,
            depositValue: depositPolicy.value,
          },
          selectedService.price
        )
      : null;

    return (
      <div className="mt-8">
        <AppointmentTicket
          variant={charge ? "pending" : "awaiting-confirmation"}
          serviceName={confirmation.serviceName}
          professionalName={confirmation.professionalName}
          locationName={confirmation.locationName}
          dateTimeLabel={formatFullDateTime(confirmation.startsAtIso, confirmation.locationTimezone)}
          message={
            charge
              ? "Tu cita quedó registrada como pendiente de confirmación. Elige cómo pagar para confirmarla."
              : "Tu cita quedó reservada. El negocio te confirmará por WhatsApp o email a la brevedad."
          }
        >
          {charge && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                {charge.kind === "DEPOSIT" ? "Paga tu seña para confirmar" : "Elige cómo pagar"}
              </p>
              {charge.kind === "DEPOSIT" && (
                <p className="mt-1 data-mono text-lg font-semibold text-ink">
                  ${Number(charge.amount).toLocaleString("es-CO")}{" "}
                  <span className="text-sm font-normal text-ink/50">ahora · el resto se paga en el local</span>
                </p>
              )}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => handlePay("stripe")} disabled={isPending} className="btn-primary">
                  {isPending ? "Redirigiendo…" : "Tarjeta internacional (Stripe)"}
                </button>
                <button type="button" onClick={() => handlePay("wompi")} disabled={isPending} className="btn-secondary">
                  {isPending ? "Redirigiendo…" : "Wompi (Colombia)"}
                </button>
              </div>
              {checkoutError && (
                <p className="msg-error mt-3">
                  No pudimos iniciar el pago: {checkoutError}. Tu cita sigue reservada; puedes
                  reservar otra o volver a intentar el pago más tarde.
                </p>
              )}
            </>
          )}
        </AppointmentTicket>

        <button type="button" onClick={resetAll} className="mt-6 text-sm text-ink/50 underline-offset-2 hover:text-pine hover:underline">
          Reservar otra cita
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {step !== "location" && (
        <div className="mb-6 flex flex-wrap gap-2">
          {crumbs.map((crumb) => (
            <Chip key={crumb.label} variant={crumb.done ? "done" : "pending"}>
              {crumb.label}
            </Chip>
          ))}
        </div>
      )}

      {step === "location" && (
        <ul className="space-y-3">
          {locations.map((loc) => (
            <li key={loc.id}>
              <OptionCard onClick={() => handleSelectLocation(loc.id)} title={loc.name} />
            </li>
          ))}
        </ul>
      )}

      {step === "service" && (
        <div>
          {hasLocationStep && <BackLink onClick={() => setStep("location")}>Volver a sedes</BackLink>}
          <ul className={hasLocationStep ? "mt-4 space-y-3" : "space-y-3"}>
            {services.map((service) => (
              <li key={service.id}>
                <ServiceCard
                  name={service.name}
                  durationMinutes={service.durationMinutes}
                  price={service.price}
                  onClick={() => handleSelectService(service.id)}
                />
                {noProfessionalsServiceId === service.id && (
                  <p className="msg-error mt-2">Este servicio no tiene profesionales disponibles por el momento.</p>
                )}
              </li>
            ))}
            {services.length === 0 && (
              <p className="text-sm text-ink/40">Este negocio todavía no tiene servicios publicados.</p>
            )}
          </ul>
        </div>
      )}

      {step === "professional" && selectedService && (
        <div>
          <BackLink onClick={() => setStep("service")}>Volver a servicios</BackLink>
          <h2 className="mt-4 font-display text-lg font-semibold text-ink">
            Elige un profesional para «{selectedService.name}»
          </h2>
          <ul className="mt-4 space-y-3">
            {professionals
              .filter(
                (p) =>
                  p.serviceIds.includes(selectedService.id) &&
                  (!selectedLocationId || p.locationIds.includes(selectedLocationId))
              )
              .map((professional) => (
                <li key={professional.id}>
                  <OptionCard onClick={() => handleSelectProfessional(professional.id)} title={professional.name} />
                </li>
              ))}
          </ul>
        </div>
      )}

      {step === "datetime" && selectedService && selectedProfessional && (
        <div>
          <BackLink onClick={() => setStep(cameFromProfessionalStep ? "professional" : "service")}>Volver</BackLink>
          <h2 className="mt-4 font-display text-lg font-semibold text-ink">
            {selectedService.name} con {selectedProfessional.name}
          </h2>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink/40">Elige una fecha</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {bookableDates.map((date) => {
              const key = calendarDateKey(date);
              const isSelected = selectedDate && calendarDateKey(selectedDate) === key;
              return (
                <Chip key={key} variant={isSelected ? "selected" : "option"} onClick={() => handleSelectDate(date)}>
                  {formatDateLabel(date)}
                </Chip>
              );
            })}
          </div>

          {selectedDate && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Elige un horario</p>
              {isPending && <p className="mt-2 text-sm text-ink/40">Cargando horarios…</p>}
              {!isPending && slotsError && <p className="msg-error mt-2">{slotsError}</p>}
              {!isPending && slots.length > 0 && (
                <>
                  <div className="mt-2 flex gap-2">
                    {DAY_PARTS.filter((part) => slots.some((iso) => slotDayPart(iso, locationTimezone) === part)).map(
                      (part) => (
                        <Chip
                          key={part}
                          variant={dayPart === part ? "selected" : "option"}
                          onClick={() => setDayPart(part)}
                        >
                          {DAY_PART_LABEL[part]}
                        </Chip>
                      )
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {slots
                      .filter((iso) => dayPart === null || slotDayPart(iso, locationTimezone) === dayPart)
                      .map((iso) => (
                        <Chip key={iso} variant="option" mono onClick={() => handleSelectSlot(iso)}>
                          {formatSlotTime(iso, locationTimezone)}
                        </Chip>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {step === "client" && selectedService && selectedProfessional && selectedSlotIso && (
        <form onSubmit={handleSubmitClient}>
          <BackLink onClick={() => setStep("datetime")}>Volver</BackLink>
          <h2 className="mt-4 font-display text-lg font-semibold text-ink">Tus datos</h2>
          <p className="mt-1 text-sm text-ink/50">
            {selectedService.name} · {formatFullDateTime(selectedSlotIso, locationTimezone)}
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="field-label" htmlFor="name">
                Nombre
              </label>
              <input
                id="name"
                type="text"
                required
                value={clientForm.name}
                onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={clientForm.email}
                onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="phone">
                Teléfono
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={clientForm.phone}
                onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))}
                className="field-input"
              />
            </div>
          </div>

          {formError && <p className="msg-error mt-3">{formError}</p>}

          <button type="submit" disabled={isPending} className="btn-primary mt-6">
            {isPending ? "Reservando…" : "Confirmar reserva"}
          </button>
        </form>
      )}
    </div>
  );
}
