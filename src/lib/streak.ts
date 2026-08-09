const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Racha de constancia (módulo de nicho bienestar, pero disponible para
// cualquier vertical — igual criterio que el CRM predictivo de recompra, que
// tampoco está atado a una vertical puntual): cuenta cuántas semanas
// consecutivas, contando desde la semana actual hacia atrás, el cliente tuvo
// al menos una cita COMPLETED. Si no tuvo ninguna cita completada esta
// semana (ventana de 7 días terminando en `now`), la racha es 0 — no cuenta
// una racha vieja que ya se cortó.
//
// Pura, sin acceso a base de datos: recibe las fechas de citas COMPLETED que
// quien llama ya haya consultado (mismo criterio que isClientInactive en
// src/lib/reengagement.ts).
export function computeWeeklySessionStreak(completedDates: Date[], now: Date): number {
  if (completedDates.length === 0) return 0;

  const weeksWithSession = new Set(
    completedDates.map((date) => Math.floor((now.getTime() - date.getTime()) / MS_PER_WEEK))
  );

  if (!weeksWithSession.has(0)) return 0;

  let streak = 0;
  let week = 0;
  while (weeksWithSession.has(week)) {
    streak += 1;
    week += 1;
  }
  return streak;
}
