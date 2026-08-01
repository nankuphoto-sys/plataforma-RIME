"use client";

import { useMemo, useState, useTransition } from "react";
import {
  getUpcomingBookableDates,
  type CalendarDate,
} from "@/lib/availability";
import {
  createAppointmentAction,
  createCheckoutSessionAction,
  createWompiCheckoutAction,
  getAvailableSlotsAction,
  type CreatedAppointment,
} from "./actions";

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

interface BookingWizardProps {
  tenantSlug: string;
  locations: BookingLocation[];
  services: BookingService[];
  professionals: BookingProfessional[];
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

export function BookingWizard({
  tenantSlug,
  locations,
  services,
  professionals,
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

  if (step === "confirmation" && confirmation) {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-semibold text-green-800">¡Cita reservada!</h2>
        <dl className="mt-4 space-y-2 text-sm text-gray-700">
          <div>
            <dt className="font-medium">Servicio</dt>
            <dd>{confirmation.serviceName}</dd>
          </div>
          <div>
            <dt className="font-medium">Profesional</dt>
            <dd>{confirmation.professionalName}</dd>
          </div>
          <div>
            <dt className="font-medium">Sede</dt>
            <dd>{confirmation.locationName}</dd>
          </div>
          <div>
            <dt className="font-medium">Fecha y hora</dt>
            <dd>{formatFullDateTime(confirmation.startsAtIso, confirmation.locationTimezone)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-gray-500">
          Tu cita quedó registrada como pendiente de confirmación.
        </p>

        <div className="mt-6">
          <p className="text-sm font-medium text-gray-700">Elige cómo pagar</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => handlePay("stripe")}
              disabled={isPending}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? "Redirigiendo..." : "Pagar con tarjeta internacional (Stripe)"}
            </button>
            <button
              type="button"
              onClick={() => handlePay("wompi")}
              disabled={isPending}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? "Redirigiendo..." : "Pagar con Wompi (Colombia)"}
            </button>
          </div>
        </div>

        {checkoutError && (
          <p className="mt-3 text-sm text-red-600">
            No pudimos iniciar el pago: {checkoutError}. Tu cita sigue reservada; puedes
            reservar otra o volver a intentar el pago más tarde.
          </p>
        )}
        <button
          type="button"
          onClick={resetAll}
          className="mt-6 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-white"
        >
          Reservar otra cita
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {step === "location" && (
        <ul className="space-y-3">
          {locations.map((loc) => (
            <li key={loc.id}>
              <button
                type="button"
                onClick={() => handleSelectLocation(loc.id)}
                className="w-full rounded-lg border border-gray-200 p-4 text-left hover:border-gray-400"
              >
                <span className="font-medium">{loc.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {step === "service" && (
        <div>
          {hasLocationStep && (
            <button
              type="button"
              onClick={() => setStep("location")}
              className="text-sm text-gray-500 hover:underline"
            >
              ← Volver a sedes
            </button>
          )}
          <ul className="mt-3 space-y-3">
          {services.map((service) => (
            <li key={service.id}>
              <button
                type="button"
                onClick={() => handleSelectService(service.id)}
                className="w-full rounded-lg border border-gray-200 p-4 text-left hover:border-gray-400"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{service.name}</span>
                  <span className="text-gray-500">{service.durationMinutes} min</span>
                </div>
              </button>
              {noProfessionalsServiceId === service.id && (
                <p className="mt-2 text-sm text-red-600">
                  Este servicio no tiene profesionales disponibles por el momento.
                </p>
              )}
            </li>
          ))}
          {services.length === 0 && (
            <p className="text-sm text-gray-400">
              Este negocio todavía no tiene servicios publicados.
            </p>
          )}
          </ul>
        </div>
      )}

      {step === "professional" && selectedService && (
        <div>
          <button type="button" onClick={() => setStep("service")} className="text-sm text-gray-500 hover:underline">
            ← Volver a servicios
          </button>
          <h2 className="mt-3 font-medium">Elige un profesional para «{selectedService.name}»</h2>
          <ul className="mt-3 space-y-3">
            {professionals
              .filter(
                (p) =>
                  p.serviceIds.includes(selectedService.id) &&
                  (!selectedLocationId || p.locationIds.includes(selectedLocationId))
              )
              .map((professional) => (
                <li key={professional.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectProfessional(professional.id)}
                    className="w-full rounded-lg border border-gray-200 p-4 text-left hover:border-gray-400"
                  >
                    {professional.name}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {step === "datetime" && selectedService && selectedProfessional && (
        <div>
          <button
            type="button"
            onClick={() => setStep(cameFromProfessionalStep ? "professional" : "service")}
            className="text-sm text-gray-500 hover:underline"
          >
            ← Volver
          </button>
          <h2 className="mt-3 font-medium">
            {selectedService.name} con {selectedProfessional.name}
          </h2>

          <p className="mt-4 text-sm font-medium text-gray-600">Elige una fecha</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {bookableDates.map((date) => {
              const key = calendarDateKey(date);
              const isSelected = selectedDate && calendarDateKey(selectedDate) === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectDate(date)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    isSelected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {formatDateLabel(date)}
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <div className="mt-6">
              <p className="text-sm font-medium text-gray-600">Elige un horario</p>
              {isPending && <p className="mt-2 text-sm text-gray-400">Cargando horarios...</p>}
              {!isPending && slotsError && (
                <p className="mt-2 text-sm text-red-600">{slotsError}</p>
              )}
              {!isPending && slots.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {slots.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => handleSelectSlot(iso)}
                      className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:border-gray-400"
                    >
                      {formatSlotTime(iso, locationTimezone)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === "client" && selectedService && selectedProfessional && selectedSlotIso && (
        <form onSubmit={handleSubmitClient}>
          <button
            type="button"
            onClick={() => setStep("datetime")}
            className="text-sm text-gray-500 hover:underline"
          >
            ← Volver
          </button>
          <h2 className="mt-3 font-medium">Tus datos</h2>
          <p className="mt-1 text-sm text-gray-500">
            {selectedService.name} · {formatFullDateTime(selectedSlotIso, locationTimezone)}
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="name">
                Nombre
              </label>
              <input
                id="name"
                type="text"
                required
                value={clientForm.name}
                onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={clientForm.email}
                onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="phone">
                Teléfono
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={clientForm.phone}
                onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? "Reservando..." : "Confirmar reserva"}
          </button>
        </form>
      )}
    </div>
  );
}
