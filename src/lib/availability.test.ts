import { describe, expect, it } from "vitest";
import {
  addDays,
  generateAvailableSlots,
  getUpcomingBookableDates,
  getWeekDates,
  type CalendarDate,
} from "./availability";

const SANTIAGO = "America/Santiago";
// 28 de julio de 2026 es un martes (día hábil).
const A_TUESDAY: CalendarDate = { year: 2026, month: 7, day: 28 };
// 1 de agosto de 2026 es un sábado (fin de semana).
const A_SATURDAY: CalendarDate = { year: 2026, month: 8, day: 1 };

describe("generateAvailableSlots", () => {
  it("genera bloques de la duración del servicio entre apertura y cierre sin citas previas", () => {
    const slots = generateAvailableSlots({
      date: A_TUESDAY,
      timezone: SANTIAGO,
      durationMinutes: 50,
      existingAppointments: [],
      now: new Date("2026-07-01T00:00:00Z"),
    });

    // 9:00 a 18:00 = 540 min; con bloques de 50 min caben 10 (el último 16:30-17:20).
    expect(slots).toHaveLength(10);
  });

  it("respeta la timezone de la sede al calcular el primer y último bloque", () => {
    const slots = generateAvailableSlots({
      date: A_TUESDAY,
      timezone: SANTIAGO,
      durationMinutes: 50,
      existingAppointments: [],
      now: new Date("2026-07-01T00:00:00Z"),
    });

    const firstLocal = new Intl.DateTimeFormat("en-US", {
      timeZone: SANTIAGO,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(slots[0]);
    expect(firstLocal).toBe("09:00");

    const lastLocal = new Intl.DateTimeFormat("en-US", {
      timeZone: SANTIAGO,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(slots[slots.length - 1]);
    expect(lastLocal).toBe("16:30");
  });

  it("excluye bloques que se solapan con una cita existente", () => {
    // La grilla de bloques de 50 min cae en 9:00, 9:50, 10:40 ... 14:00, 14:50 (hora local).
    // El bloque de 14:00-14:50 local equivale a 18:00-18:50 UTC (Santiago = UTC-4).
    const bookedStart = new Date("2026-07-28T18:00:00.000Z");
    const bookedEnd = new Date("2026-07-28T18:50:00.000Z");

    const slots = generateAvailableSlots({
      date: A_TUESDAY,
      timezone: SANTIAGO,
      durationMinutes: 50,
      existingAppointments: [{ startsAt: bookedStart, endsAt: bookedEnd }],
      now: new Date("2026-07-01T00:00:00Z"),
    });

    expect(slots).toHaveLength(9);
    const overlapsBooked = slots.some(
      (s) =>
        s.getTime() < bookedEnd.getTime() &&
        new Date(s.getTime() + 50 * 60_000).getTime() > bookedStart.getTime()
    );
    expect(overlapsBooked).toBe(false);
  });

  it("excluye también los bloques adyacentes cuando una cita no alinea con la grilla", () => {
    // Cita de 10:00 a 10:50 local (14:00-14:50 UTC) no coincide con ningún límite
    // de la grilla (9:00, 9:50, 10:40, 11:30...), así que se solapa con dos bloques:
    // 9:50-10:40 y 10:40-11:30.
    const slots = generateAvailableSlots({
      date: A_TUESDAY,
      timezone: SANTIAGO,
      durationMinutes: 50,
      existingAppointments: [
        {
          startsAt: new Date("2026-07-28T14:00:00.000Z"),
          endsAt: new Date("2026-07-28T14:50:00.000Z"),
        },
      ],
      now: new Date("2026-07-01T00:00:00Z"),
    });

    expect(slots).toHaveLength(8);
  });

  it("excluye bloques que ya pasaron cuando la fecha consultada es hoy", () => {
    // "Ahora" = 28 jul 2026, 12:30 en Santiago (UTC-4) = 16:30 UTC.
    const now = new Date("2026-07-28T16:30:00.000Z");

    const slots = generateAvailableSlots({
      date: A_TUESDAY,
      timezone: SANTIAGO,
      durationMinutes: 50,
      existingAppointments: [],
      now,
    });

    // Bloques de 9:00 a 12:20 (5 bloques) ya pasaron; quedan 5.
    expect(slots).toHaveLength(5);
    for (const slot of slots) {
      expect(slot.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
  });

  it("retorna vacío para un día fuera del horario de atención (fin de semana)", () => {
    const slots = generateAvailableSlots({
      date: A_SATURDAY,
      timezone: SANTIAGO,
      durationMinutes: 50,
      existingAppointments: [],
      now: new Date("2026-07-01T00:00:00Z"),
    });

    expect(slots).toHaveLength(0);
  });
});

describe("getUpcomingBookableDates", () => {
  it("excluye fines de semana de las próximas fechas reservables", () => {
    // 24 de julio de 2026 es viernes.
    const now = new Date("2026-07-24T15:00:00.000Z");
    const dates = getUpcomingBookableDates(SANTIAGO, now, { daysToScan: 4 });

    // vie 24, (sáb 25 y dom 26 excluidos), lun 27 -> 2 fechas hábiles.
    expect(dates).toEqual([
      { year: 2026, month: 7, day: 24 },
      { year: 2026, month: 7, day: 27 },
    ]);
  });
});

describe("getWeekDates", () => {
  it("retorna lunes a viernes de la semana que contiene la fecha, si esta es un día hábil", () => {
    // 28 de julio de 2026 es martes.
    expect(getWeekDates(A_TUESDAY)).toEqual([
      { year: 2026, month: 7, day: 27 },
      { year: 2026, month: 7, day: 28 },
      { year: 2026, month: 7, day: 29 },
      { year: 2026, month: 7, day: 30 },
      { year: 2026, month: 7, day: 31 },
    ]);
  });

  it("retorna la misma semana hábil aunque la fecha de referencia caiga en fin de semana", () => {
    // 1 de agosto de 2026 es sábado; su semana es la misma que la del martes 28 de julio.
    expect(getWeekDates(A_SATURDAY)).toEqual(getWeekDates(A_TUESDAY));
  });
});

describe("addDays", () => {
  it("avanza y retrocede cruzando límites de mes", () => {
    expect(addDays({ year: 2026, month: 7, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 8,
      day: 1,
    });
    expect(addDays({ year: 2026, month: 8, day: 1 }, -1)).toEqual({
      year: 2026,
      month: 7,
      day: 31,
    });
  });
});
