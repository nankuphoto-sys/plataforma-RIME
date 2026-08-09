import type { TenantVertical } from "@prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const FOLLOW_UP_INTERVAL_DAYS = 14;

// Auto-agendar control de seguimiento solo tiene sentido para verticales de
// salud (psicología, nutrición, fisioterapia) — para barbería/estética/
// general, crear solo una cita sin que nadie la pida sería una sorpresa no
// deseada, no un valor agregado. A diferencia de racha de constancia/
// portabilidad de cliente (deliberadamente sin gating de vertical en este
// mismo proyecto), este módulo SÍ se restringe por vertical.
export const AUTO_FOLLOW_UP_VERTICALS: readonly TenantVertical[] = [
  "PSICOLOGIA",
  "NUTRICION",
  "FISIOTERAPIA",
];

export function isAutoFollowUpVertical(vertical: TenantVertical): boolean {
  return (AUTO_FOLLOW_UP_VERTICALS as readonly TenantVertical[]).includes(vertical);
}

export interface FollowUpSlot {
  startsAt: Date;
  endsAt: Date;
}

// Candidato de seguimiento: mismo horario del día, FOLLOW_UP_INTERVAL_DAYS
// después de la cita original. Pura — no consulta disponibilidad real, eso
// lo hace isFollowUpSlotFree con las citas ya consultadas por quien llama.
export function computeFollowUpSlot(originalStartsAt: Date, durationMinutes: number): FollowUpSlot {
  const startsAt = new Date(originalStartsAt.getTime() + FOLLOW_UP_INTERVAL_DAYS * MS_PER_DAY);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return { startsAt, endsAt };
}

// Nunca fuerza el horario: si el candidato choca con cualquier cita
// existente del profesional (que no esté CANCELLED), no se crea nada — el
// staff agenda a mano. Nunca elige otro horario por su cuenta.
export function isFollowUpSlotFree(candidate: FollowUpSlot, existingAppointments: FollowUpSlot[]): boolean {
  return !existingAppointments.some(
    (appt) => candidate.startsAt < appt.endsAt && candidate.endsAt > appt.startsAt
  );
}
