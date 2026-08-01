// Cálculo de posición/alto de un bloque de cita dentro de la grilla semanal
// de la agenda interna. Reutiliza el horario fijo de atención definido en
// availability.ts — no duplica esa lógica.

import {
  DEFAULT_BUSINESS_HOURS,
  getBusinessHoursWindowUtc,
  type BusinessHours,
  type CalendarDate,
} from "./availability";

export interface AppointmentBlockPosition {
  // Posición y alto como porcentaje (0-100) de la altura total de la
  // columna del día, que representa el horario de atención completo
  // (ej. 9:00-18:00). Pensado para usarse directamente como `top`/`height`
  // con position: absolute.
  topPercent: number;
  heightPercent: number;
}

export interface GetAppointmentBlockPositionParams {
  startsAt: Date;
  endsAt: Date;
  date: CalendarDate;
  timezone: string;
  businessHours?: BusinessHours;
}

export function getAppointmentBlockPosition(
  params: GetAppointmentBlockPositionParams
): AppointmentBlockPosition {
  const businessHours = params.businessHours ?? DEFAULT_BUSINESS_HOURS;
  const { openAt, closeAt } = getBusinessHoursWindowUtc(
    params.date,
    params.timezone,
    businessHours
  );

  const totalMs = closeAt.getTime() - openAt.getTime();
  const topPercent = ((params.startsAt.getTime() - openAt.getTime()) / totalMs) * 100;
  const heightPercent = ((params.endsAt.getTime() - params.startsAt.getTime()) / totalMs) * 100;

  return { topPercent, heightPercent };
}

// Marcas de hora en punto para el eje de tiempo de la grilla (ej. [9,10,...,18]).
export function getHourMarks(businessHours: BusinessHours = DEFAULT_BUSINESS_HOURS): number[] {
  const marks: number[] = [];
  for (let hour = businessHours.startHour; hour <= businessHours.endHour; hour++) {
    marks.push(hour);
  }
  return marks;
}
