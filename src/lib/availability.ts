// Cálculo de disponibilidad para la agenda pública.
// El horario de atención es fijo por ahora (no existe todavía un modelo de
// horarios por profesional en el schema) — cuando se modele, esta constante
// se reemplaza por datos reales sin tocar la lógica de cálculo de bloques.

export interface BusinessHours {
  workDays: number[]; // 0 = domingo ... 6 = sábado
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  workDays: [1, 2, 3, 4, 5], // lunes a viernes
  startHour: 9,
  startMinute: 0,
  endHour: 18,
  endMinute: 0,
};

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export interface ExistingAppointment {
  startsAt: Date;
  endsAt: Date;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

// Convierte una hora "de pared" (ej. 9:00 en America/Santiago) al instante
// UTC correspondiente. Técnica estándar: parte de un instante candidato,
// mide el desfase real de la zona horaria en ese instante y corrige.
export function zonedTimeToUtc(
  date: CalendarDate,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const utcGuess = new Date(
    Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0)
  );
  const parts = getZonedParts(utcGuess, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const diffMs = asUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - diffMs);
}

// Suma (o resta, con un valor negativo) días calendario a una fecha.
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const cursor = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
  };
}

// Fecha calendario de "hoy" en la timezone de la sede.
export function getTodayInTimezone(timezone: string, now: Date = new Date()): CalendarDate {
  const { year, month, day } = getZonedParts(now, timezone);
  return { year, month, day };
}

// Ventana [apertura, cierre) del horario de atención para un día puntual,
// como instantes UTC. Reutilizada por el cálculo de slots y por la agenda
// interna (posición/alto de los bloques de cita en la grilla).
export function getBusinessHoursWindowUtc(
  date: CalendarDate,
  timeZone: string,
  businessHours: BusinessHours = DEFAULT_BUSINESS_HOURS
): { openAt: Date; closeAt: Date } {
  return {
    openAt: zonedTimeToUtc(date, businessHours.startHour, businessHours.startMinute, timeZone),
    closeAt: zonedTimeToUtc(date, businessHours.endHour, businessHours.endMinute, timeZone),
  };
}

// Límites [inicio, fin) del día calendario (en la timezone de la sede),
// expresados como instantes UTC. Útil para acotar queries de citas por día.
export function getDayBoundsUtc(
  date: CalendarDate,
  timeZone: string
): { start: Date; end: Date } {
  const start = zonedTimeToUtc(date, 0, 0, timeZone);
  const end = zonedTimeToUtc(addDays(date, 1), 0, 0, timeZone);
  return { start, end };
}

// Próximas fechas reservables (excluye fines de semana según el horario fijo),
// a partir de "hoy" en la timezone de la sede.
export function getUpcomingBookableDates(
  timezone: string,
  now: Date = new Date(),
  options?: { daysToScan?: number; workDays?: number[] }
): CalendarDate[] {
  const daysToScan = options?.daysToScan ?? 14;
  const workDays = options?.workDays ?? DEFAULT_BUSINESS_HOURS.workDays;
  const today = getTodayInTimezone(timezone, now);

  const dates: CalendarDate[] = [];
  for (let i = 0; i < daysToScan; i++) {
    const cursor = addDays(today, i);
    const weekday = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day)).getUTCDay();
    if (workDays.includes(weekday)) dates.push(cursor);
  }
  return dates;
}

// Días hábiles (según `workDays`) de la semana calendario que contiene
// `referenceDate` — sin importar qué día de la semana sea esa fecha.
// Usado por la agenda interna para navegar semana a semana.
export function getWeekDates(
  referenceDate: CalendarDate,
  workDays: number[] = DEFAULT_BUSINESS_HOURS.workDays
): CalendarDate[] {
  const referenceWeekday = new Date(
    Date.UTC(referenceDate.year, referenceDate.month - 1, referenceDate.day)
  ).getUTCDay();
  const daysSinceMonday = (referenceWeekday + 6) % 7; // domingo(0) -> 6, lunes(1) -> 0, ...
  const monday = addDays(referenceDate, -daysSinceMonday);

  const dates: CalendarDate[] = [];
  for (let i = 0; i < 7; i++) {
    const cursor = addDays(monday, i);
    const weekday = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day)).getUTCDay();
    if (workDays.includes(weekday)) dates.push(cursor);
  }
  return dates;
}

// Serialización de una fecha calendario para usar como parámetro de URL
// (ej. ?week=2026-07-28) y su parseo inverso.
export function formatCalendarDateKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function parseCalendarDateKey(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

export interface GenerateAvailableSlotsParams {
  date: CalendarDate;
  timezone: string;
  durationMinutes: number;
  existingAppointments: ExistingAppointment[];
  now?: Date;
  businessHours?: BusinessHours;
}

// Genera los bloques horarios disponibles para una fecha y servicio dados:
// arranca en el horario de apertura, avanza de a `durationMinutes`, descarta
// bloques que se solapan con citas existentes y bloques que ya pasaron.
export function generateAvailableSlots(
  params: GenerateAvailableSlotsParams
): Date[] {
  const {
    date,
    timezone,
    durationMinutes,
    existingAppointments,
    now = new Date(),
    businessHours = DEFAULT_BUSINESS_HOURS,
  } = params;

  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  if (!businessHours.workDays.includes(weekday)) return [];

  const { openAt, closeAt } = getBusinessHoursWindowUtc(date, timezone, businessHours);
  const durationMs = durationMinutes * 60_000;

  const slots: Date[] = [];
  for (
    let cursorMs = openAt.getTime();
    cursorMs + durationMs <= closeAt.getTime();
    cursorMs += durationMs
  ) {
    const slotStart = new Date(cursorMs);
    const slotEnd = new Date(cursorMs + durationMs);

    if (slotStart.getTime() < now.getTime()) continue;

    const overlaps = existingAppointments.some(
      (appt) => slotStart < appt.endsAt && slotEnd > appt.startsAt
    );
    if (!overlaps) slots.push(slotStart);
  }

  return slots;
}
