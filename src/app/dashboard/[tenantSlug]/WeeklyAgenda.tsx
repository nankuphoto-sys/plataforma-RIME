"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentStatus, PaymentKind, PaymentStatus } from "@prisma/client";
import { CheckCheck, CheckCircle2, Clock, Loader2, UserX, X, XCircle } from "lucide-react";
import { getTodayInTimezone, type CalendarDate } from "@/lib/availability";
import { getAppointmentBlockPosition, getHourMarks } from "@/lib/appointmentGrid";
import { ALLOWED_STATUS_TRANSITIONS, APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";
import { updateAppointmentStatusAction } from "./actions";

export interface AgendaProfessional {
  id: string;
  name: string;
}

export interface AgendaAppointmentBlock {
  id: string;
  professionalId: string;
  dayIndex: number;
  status: AppointmentStatus;
  topPercent: number;
  heightPercent: number;
  startsAtIso: string;
  endsAtIso: string;
  serviceName: string;
  durationMinutes: number;
  client: { name: string; email: string | null; phone: string | null };
  payment: { status: PaymentStatus; kind: PaymentKind } | null;
}

interface WeeklyAgendaProps {
  tenantSlug: string;
  locationTimezone: string;
  weekDates: CalendarDate[];
  professionals: AgendaProfessional[];
  blocks: AgendaAppointmentBlock[];
}

const GRID_HEIGHT_PX = 720;

// Un borde izquierdo marcado + relleno suave por estado, en vez de colores
// de semáforo genéricos — usa la misma paleta que el resto del dashboard.
// Se reutiliza tal cual tanto en los bloques de la grilla semanal (desktop)
// como en las tarjetas de la vista de un día (mobile).
const STATUS_STYLES: Record<AppointmentStatus, string> = {
  PENDING: "border-l-gold bg-gold/10 text-ink",
  CONFIRMED: "border-l-pine bg-pine/10 text-ink",
  COMPLETED: "border-l-pine-dark bg-pine-dark/15 text-ink",
  CANCELLED: "border-l-ink/20 bg-ink/5 text-ink/40 line-through",
  NO_SHOW: "border-l-berry bg-berry/10 text-ink",
};

const STATUS_BADGE_STYLES: Record<AppointmentStatus, string> = {
  PENDING: "badge-gold",
  CONFIRMED: "badge-pine",
  COMPLETED: "badge-pine",
  CANCELLED: "badge-neutral",
  NO_SHOW: "badge-berry",
};

const STATUS_ICONS: Record<AppointmentStatus, typeof Clock> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  COMPLETED: CheckCheck,
  CANCELLED: XCircle,
  NO_SHOW: UserX,
};

function formatDayLabel(date: CalendarDate): string {
  const asUtcNoon = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
  const label = asUtcNoon.toLocaleDateString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Versión corta para el selector de día del mobile (ej. "Lun" en vez de
// "Lun, 4 ago") — no alcanza el espacio de un pill de 52px para la versión
// larga que ya usa formatDayLabel en la grilla de escritorio.
function formatWeekdayAbbrev(date: CalendarDate): string {
  const asUtcNoon = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
  const label = asUtcNoon
    .toLocaleDateString("es-CL", { weekday: "short", timeZone: "UTC" })
    .replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatTime(iso: string, timezone: string): string {
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
    day: "numeric",
    month: "long",
    timeZone: timezone,
  });
  return `${label.charAt(0).toUpperCase() + label.slice(1)} a las ${formatTime(iso, timezone)}`;
}

function isSameCalendarDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function WeeklyAgenda({
  tenantSlug,
  locationTimezone,
  weekDates,
  professionals,
  blocks,
}: WeeklyAgendaProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AppointmentStatus>>({});
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pendingNextStatus, setPendingNextStatus] = useState<AppointmentStatus | null>(null);
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  // Solo para la vista mobile (selector de un día a la vez) — arranca en el
  // primer día de la semana hasta que sepamos cuál es "hoy" en el cliente
  // (ver el useEffect de más abajo), y respeta que el usuario haya elegido
  // otro día a mano sin que el reloj se lo pise cada minuto.
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [hasManuallySelectedDay, setHasManuallySelectedDay] = useState(false);

  const hourMarks = useMemo(() => getHourMarks(), []);

  // Solo en el cliente: evita un mismatch de hidratación (el server no
  // conoce el reloj/huso del navegador) y mantiene la línea de "ahora" viva.
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const currentTimeMarker = useMemo(() => {
    if (!now) return null;
    const todayInLocation = getTodayInTimezone(locationTimezone, now);
    const dayIndex = weekDates.findIndex((date) => isSameCalendarDate(date, todayInLocation));
    if (dayIndex === -1) return null;

    const { topPercent } = getAppointmentBlockPosition({
      startsAt: now,
      endsAt: now,
      date: todayInLocation,
      timezone: locationTimezone,
    });
    if (topPercent < 0 || topPercent > 100) return null;

    return { dayIndex, topPercent };
  }, [now, locationTimezone, weekDates]);

  // Apenas sabemos qué día es "hoy" (client-side), el selector de día del
  // mobile salta ahí solo — pero nunca si el usuario ya tocó otro día a
  // mano, para no pisarle la elección cada vez que pasa un minuto.
  useEffect(() => {
    if (!hasManuallySelectedDay && currentTimeMarker) {
      setSelectedDayIndex(currentTimeMarker.dayIndex);
    }
  }, [currentTimeMarker, hasManuallySelectedDay]);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) ?? null;

  const selectedDayBlocks = useMemo(
    () =>
      blocks
        .filter((b) => b.dayIndex === selectedDayIndex)
        .slice()
        .sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso)),
    [blocks, selectedDayIndex]
  );

  function getEffectiveStatus(block: AgendaAppointmentBlock): AppointmentStatus {
    return statusOverrides[block.id] ?? block.status;
  }

  function handleStatusChange(appointmentId: string, nextStatus: AppointmentStatus) {
    setStatusError(null);
    setPendingNextStatus(nextStatus);
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(tenantSlug, appointmentId, nextStatus);
      if (!result.ok) {
        setStatusError(result.error ?? "No se pudo actualizar el estado.");
        setPendingNextStatus(null);
        return;
      }
      setStatusOverrides((prev) => ({ ...prev, [appointmentId]: nextStatus }));
      setPendingNextStatus(null);
      router.refresh();
    });
  }

  if (blocks.length === 0) {
    return (
      <div className="panel border-dashed py-16 text-center">
        <p className="text-sm text-ink/45">No hay citas agendadas para esta semana.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Vista mobile: un día a la vez, con selector de día — la grilla de
          7 columnas de la vista de escritorio no entra en un celular sin
          scroll horizontal Y vertical a la vez, así que abajo de `md` se
          reemplaza por esta lista, no se intenta encoger la misma grilla. */}
      <div className="md:hidden">
        <div className="rise-row flex gap-1.5 overflow-x-auto pb-1">
          {weekDates.map((date, dayIndex) => {
            const isSelected = dayIndex === selectedDayIndex;
            const isToday = currentTimeMarker?.dayIndex === dayIndex;
            const hasBlocksThisDay = blocks.some((b) => b.dayIndex === dayIndex);
            return (
              <button
                key={formatDayLabel(date)}
                type="button"
                onClick={() => {
                  setSelectedDayIndex(dayIndex);
                  setHasManuallySelectedDay(true);
                }}
                className={`flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 text-xs transition-colors duration-150 active:scale-[0.97] ${
                  isSelected
                    ? "border-pine bg-pine text-paper"
                    : isToday
                      ? "border-pine/50 bg-pine/5 text-ink/70"
                      : "border-sage-dark/40 bg-white text-ink/70"
                }`}
              >
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {formatWeekdayAbbrev(date)}
                </span>
                <span className="data-mono text-sm font-semibold">{date.day}</span>
                <span
                  className={`h-1 w-1 rounded-full ${
                    hasBlocksThisDay ? (isSelected ? "bg-paper" : "bg-pine") : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="rise-row mt-3 space-y-2">
          {selectedDayBlocks.length === 0 ? (
            <p className="panel border-dashed py-8 text-center text-sm text-ink/40">
              No hay citas este día.
            </p>
          ) : (
            selectedDayBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => setSelectedBlockId(block.id)}
                className={`panel flex w-full items-center gap-3 border-l-4 text-left transition active:scale-[0.98] ${
                  STATUS_STYLES[getEffectiveStatus(block)]
                }`}
              >
                <div className="data-mono w-14 shrink-0 text-sm font-semibold">
                  {formatTime(block.startsAtIso, locationTimezone)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{block.client.name}</p>
                  <p className="truncate text-xs opacity-70">
                    {block.serviceName}
                    {professionals.length > 1 &&
                      ` · ${professionals.find((p) => p.id === block.professionalId)?.name ?? ""}`}
                  </p>
                </div>
                <span className={`badge shrink-0 ${STATUS_BADGE_STYLES[getEffectiveStatus(block)]}`}>
                  {APPOINTMENT_STATUS_LABELS[getEffectiveStatus(block)]}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Vista de escritorio: grilla semanal completa (sin cambios). */}
      <div className="hidden gap-2 md:flex">
        <div className="w-12 shrink-0">
          <div className="h-16" />
          <div className="relative" style={{ height: GRID_HEIGHT_PX }}>
            {hourMarks.map((hour, i) => (
              <div
                key={hour}
                className="data-mono absolute left-0 -translate-y-1/2 text-[11px] text-ink/35"
                style={{ top: `${(i / (hourMarks.length - 1)) * 100}%` }}
              >
                {hour}:00
              </div>
            ))}
          </div>
        </div>

        <div className="rise-row flex flex-1 gap-2 overflow-x-auto">
          {weekDates.map((date, dayIndex) => {
            const dayBlocks = blocks.filter((b) => b.dayIndex === dayIndex);
            const isToday = currentTimeMarker?.dayIndex === dayIndex;
            return (
              <div key={formatDayLabel(date)} className="min-w-[160px] flex-1">
                <div
                  className={`flex h-7 items-center justify-center gap-1.5 text-center text-sm font-semibold ${isToday ? "text-pine" : "text-ink/70"}`}
                >
                  {isToday && <span className="live-dot live-dot-pine" />}
                  {formatDayLabel(date)}
                </div>
                <div className="flex h-9">
                  {professionals.map((professional) => (
                    <div
                      key={professional.id}
                      className="flex-1 truncate px-1 text-center text-[11px] text-ink/40"
                      title={professional.name}
                    >
                      {professional.name}
                    </div>
                  ))}
                </div>
                <div
                  className="relative overflow-hidden rounded-lg border border-sage-dark/40 bg-white"
                  style={{ height: GRID_HEIGHT_PX }}
                >
                  {hourMarks.slice(0, -1).map((hour, i) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-sage/60"
                      style={{ top: `${(i / (hourMarks.length - 1)) * 100}%` }}
                    />
                  ))}

                  {isToday && currentTimeMarker && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                      style={{ top: `${currentTimeMarker.topPercent}%` }}
                    >
                      <span className="live-dot -ml-[3px]" />
                      <span className="h-px flex-1 bg-berry/70" />
                    </div>
                  )}

                  <div className="absolute inset-0 flex">
                    {professionals.map((professional) => (
                      <div
                        key={professional.id}
                        className="relative flex-1 border-l border-sage/60 first:border-l-0"
                      >
                        {dayBlocks
                          .filter((b) => b.professionalId === professional.id)
                          .map((block) => (
                            <button
                              key={block.id}
                              type="button"
                              onClick={() => setSelectedBlockId(block.id)}
                              className={`absolute left-0.5 right-0.5 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight transition-[filter] hover:brightness-95 ${
                                STATUS_STYLES[getEffectiveStatus(block)]
                              }`}
                              style={{
                                top: `${block.topPercent}%`,
                                height: `${Math.max(block.heightPercent, 4)}%`,
                              }}
                            >
                              <div className="data-mono font-medium">
                                {formatTime(block.startsAtIso, locationTimezone)}
                              </div>
                              <div className="truncate">{block.serviceName}</div>
                              <div className="truncate opacity-70">{block.client.name}</div>
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedBlock && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-ink/30"
          onClick={() => setSelectedBlockId(null)}
        >
          <div
            className="h-full w-full max-w-sm overflow-y-auto bg-paper p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedBlockId(null)}
              className="group inline-flex items-center gap-1 shell-link"
            >
              <X className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:scale-110" />
              Cerrar
            </button>

            <h2 className="mt-4 font-display text-xl font-semibold text-ink">
              {selectedBlock.client.name}
            </h2>
            <dl className="mt-4 space-y-3 text-sm text-ink/80">
              <div>
                <dt className="font-medium text-ink/45">Email</dt>
                <dd>{selectedBlock.client.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink/45">Teléfono</dt>
                <dd className="data-mono">{selectedBlock.client.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink/45">Servicio</dt>
                <dd>
                  {selectedBlock.serviceName} · {selectedBlock.durationMinutes} min
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink/45">Horario</dt>
                <dd className="data-mono">
                  {formatFullDateTime(selectedBlock.startsAtIso, locationTimezone)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink/45">Estado actual</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${STATUS_BADGE_STYLES[getEffectiveStatus(selectedBlock)]}`}>
                    {APPOINTMENT_STATUS_LABELS[getEffectiveStatus(selectedBlock)]}
                  </span>
                  {getEffectiveStatus(selectedBlock) === "NO_SHOW" && selectedBlock.payment?.status === "PAID" && (
                    <span className="badge badge-gold" title="No se reembolsa automáticamente">
                      {selectedBlock.payment.kind === "DEPOSIT" ? "Seña retenida" : "Pago retenido"}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-sage-dark/30 pt-4">
              <p className="section-title text-sm">Cambiar estado</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALLOWED_STATUS_TRANSITIONS[getEffectiveStatus(selectedBlock)].map((next) => {
                  const isThisPending = isPending && pendingNextStatus === next;
                  const StatusIcon = STATUS_ICONS[next];
                  return (
                    <button
                      key={next}
                      type="button"
                      disabled={isPending}
                      onClick={() => handleStatusChange(selectedBlock.id, next)}
                      className="btn-secondary-sm"
                    >
                      {isThisPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <StatusIcon className="h-3.5 w-3.5" />
                      )}
                      {APPOINTMENT_STATUS_LABELS[next]}
                    </button>
                  );
                })}
                {ALLOWED_STATUS_TRANSITIONS[getEffectiveStatus(selectedBlock)].length === 0 && (
                  <p className="text-sm text-ink/35">Este estado ya es definitivo.</p>
                )}
              </div>
              {statusError && <p className="msg-error mt-2">{statusError}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
