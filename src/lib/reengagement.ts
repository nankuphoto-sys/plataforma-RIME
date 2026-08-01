const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const INACTIVITY_THRESHOLD_DAYS = 60;
export const FOLLOWUP_COOLDOWN_DAYS = 90;

// Un cliente es candidato a un aviso de recompra cuando tuvo al menos una
// cita COMPLETED, no tiene ninguna cita futura agendada, y pasaron 60 días o
// más desde su cita COMPLETED más reciente.
export function isClientInactive(params: {
  lastCompletedAppointmentAt: Date | null;
  hasUpcomingAppointment: boolean;
  now: Date;
}): boolean {
  const { lastCompletedAppointmentAt, hasUpcomingAppointment, now } = params;

  if (!lastCompletedAppointmentAt) return false;
  if (hasUpcomingAppointment) return false;

  const daysSinceLastCompleted =
    (now.getTime() - lastCompletedAppointmentAt.getTime()) / MS_PER_DAY;
  return daysSinceLastCompleted >= INACTIVITY_THRESHOLD_DAYS;
}
