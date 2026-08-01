export const REMINDER_HOURS_BEFORE = 24;

// Devuelve la fecha en la que debe dispararse el recordatorio (24h antes del
// inicio de la cita), o null si la cita es en menos de 24h desde `now` — en
// ese caso no tiene sentido programar un recordatorio "24h antes" que ya
// nació en el pasado, así que simplemente no se crea.
export function computeReminderScheduledFor(startsAt: Date, now: Date): Date | null {
  const scheduledFor = new Date(startsAt.getTime() - REMINDER_HOURS_BEFORE * 60 * 60 * 1000);
  return scheduledFor > now ? scheduledFor : null;
}

// Mismo estilo de formato legible en español que el resto de la app (ver
// formatFullDateTime en src/app/(public)/[tenantSlug]/PostCheckoutStatus.tsx)
// — día de la semana, día, mes y año, y hora en 24h, en la timezone de la sede.
export function formatAppointmentDateTimeLabel(startsAt: Date, timezone: string): string {
  const label = startsAt.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });
  const time = startsAt.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
  return `${label.charAt(0).toUpperCase() + label.slice(1)} a las ${time}`;
}
