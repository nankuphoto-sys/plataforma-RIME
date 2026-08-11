"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { createManualAppointmentAction } from "./actions";
import type { AgendaProfessional } from "./WeeklyAgenda";

export interface AgendaServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
  professionalIds: string[];
}

export interface AgendaClientOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface NewAppointmentPanelProps {
  tenantSlug: string;
  locationId: string;
  professionals: AgendaProfessional[];
  services: AgendaServiceOption[];
  clients: AgendaClientOption[];
  initialProfessionalId: string;
  initialDateKey: string;
  initialTime: string;
  onClose: () => void;
  onCreated: () => void;
}

// Agendamiento manual — el único punto de entrada para que el propio negocio
// cargue una cita (walk-in, teléfono, alguien sin WhatsApp). Se abre tanto
// desde el botón "Nueva cita" como al hacer clic en una celda vacía de la
// grilla (que llega con profesional/día/hora ya precargados).
export function NewAppointmentPanel({
  tenantSlug,
  locationId,
  professionals,
  services,
  clients,
  initialProfessionalId,
  initialDateKey,
  initialTime,
  onClose,
  onCreated,
}: NewAppointmentPanelProps) {
  const [clientMode, setClientMode] = useState<"existing" | "new">(clients.length > 0 ? "existing" : "new");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const eligibleProfessionals = useMemo(() => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return professionals;
    const eligible = professionals.filter((p) => service.professionalIds.includes(p.id));
    return eligible.length > 0 ? eligible : professionals;
  }, [serviceId, services, professionals]);

  const [professionalId, setProfessionalId] = useState(
    eligibleProfessionals.some((p) => p.id === initialProfessionalId)
      ? initialProfessionalId
      : (eligibleProfessionals[0]?.id ?? initialProfessionalId)
  );
  const [dateKey, setDateKey] = useState(initialDateKey);
  const [time, setTime] = useState(initialTime);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    const service = services.find((s) => s.id === nextServiceId);
    const eligible = service
      ? professionals.filter((p) => service.professionalIds.includes(p.id))
      : professionals;
    if (eligible.length > 0 && !eligible.some((p) => p.id === professionalId)) {
      setProfessionalId(eligible[0].id);
    }
  }

  function handleSubmit() {
    setError(null);
    if (!serviceId || !professionalId || !dateKey || !time) {
      setError("Completa todos los campos.");
      return;
    }
    if (clientMode === "existing" && !clientId) {
      setError("Selecciona un cliente.");
      return;
    }
    if (clientMode === "new" && !newClientName.trim()) {
      setError("Escribe el nombre del cliente.");
      return;
    }

    startTransition(async () => {
      const result = await createManualAppointmentAction(tenantSlug, {
        locationId,
        professionalId,
        serviceId,
        dateKey,
        time,
        ...(clientMode === "existing"
          ? { clientId }
          : { newClient: { name: newClientName, email: newClientEmail, phone: newClientPhone } }),
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo crear la cita.");
        return;
      }
      onCreated();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-sm overflow-y-auto bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="group inline-flex items-center gap-1 shell-link">
          <X className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:scale-110" />
          Cerrar
        </button>

        <h2 className="mt-4 font-display text-xl font-semibold text-ink">Nueva cita</h2>
        <p className="mt-1 text-sm text-ink/60">
          Para agendar a mano — una llamada, un walk-in, alguien sin WhatsApp.
        </p>

        {error && <p className="msg-error mt-4">{error}</p>}

        <div className="mt-5 space-y-4">
          <div>
            <p className="field-label">Cliente</p>
            <div className="mt-1.5 inline-flex rounded-lg border border-sage-dark/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setClientMode("existing")}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  clientMode === "existing" ? "bg-pine text-paper" : "text-ink/60 hover:text-ink"
                }`}
              >
                Existente
              </button>
              <button
                type="button"
                onClick={() => setClientMode("new")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                  clientMode === "new" ? "bg-pine text-paper" : "text-ink/60 hover:text-ink"
                }`}
              >
                <UserPlus className="h-3 w-3" />
                Nuevo
              </button>
            </div>

            {clientMode === "existing" ? (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="field-input mt-2"
              >
                {clients.length === 0 && <option value="">No hay clientes todavía</option>}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {client.phone ? ` · ${client.phone}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="field-input mt-0"
                />
                <input
                  type="tel"
                  placeholder="Teléfono (opcional)"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="field-input mt-0"
                />
                <input
                  type="email"
                  placeholder="Email (opcional)"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  className="field-input mt-0"
                />
              </div>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="new-appt-service">
              Servicio
            </label>
            <select
              id="new-appt-service"
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              className="field-input"
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.durationMinutes} min
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="new-appt-professional">
              Profesional
            </label>
            <select
              id="new-appt-professional"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              className="field-input"
            >
              {eligibleProfessionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="new-appt-date">
                Fecha
              </label>
              <input
                id="new-appt-date"
                type="date"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="new-appt-time">
                Hora
              </label>
              <input
                id="new-appt-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={handleSubmit} disabled={isPending} className="btn-primary flex-1">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Agendar cita
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
