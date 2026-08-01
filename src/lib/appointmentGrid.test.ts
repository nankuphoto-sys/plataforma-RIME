import { describe, expect, it } from "vitest";
import { getAppointmentBlockPosition, getHourMarks } from "./appointmentGrid";
import type { CalendarDate } from "./availability";

const SANTIAGO = "America/Santiago";
// 28 de julio de 2026 es un martes; Santiago está en UTC-4 en esa fecha
// (confirmado en availability.test.ts: 9:00 local = 13:00 UTC).
const A_TUESDAY: CalendarDate = { year: 2026, month: 7, day: 28 };

describe("getAppointmentBlockPosition", () => {
  it("ubica una cita que empieza a la apertura en topPercent 0", () => {
    const position = getAppointmentBlockPosition({
      startsAt: new Date("2026-07-28T13:00:00.000Z"), // 9:00 local
      endsAt: new Date("2026-07-28T13:50:00.000Z"), // 9:50 local
      date: A_TUESDAY,
      timezone: SANTIAGO,
    });

    expect(position.topPercent).toBeCloseTo(0, 5);
  });

  it("ubica una cita que termina al cierre en topPercent + heightPercent = 100", () => {
    const position = getAppointmentBlockPosition({
      startsAt: new Date("2026-07-28T21:10:00.000Z"), // 17:10 local
      endsAt: new Date("2026-07-28T22:00:00.000Z"), // 18:00 local (cierre)
      date: A_TUESDAY,
      timezone: SANTIAGO,
    });

    expect(position.topPercent + position.heightPercent).toBeCloseTo(100, 5);
  });

  it("calcula heightPercent proporcional a la duración del bloque de atención (9h)", () => {
    // Cita de 13:00 a 17:30 local = 4.5h sobre una jornada de 9h -> 50%.
    const position = getAppointmentBlockPosition({
      startsAt: new Date("2026-07-28T17:00:00.000Z"), // 13:00 local
      endsAt: new Date("2026-07-28T21:30:00.000Z"), // 17:30 local
      date: A_TUESDAY,
      timezone: SANTIAGO,
    });

    expect(position.heightPercent).toBeCloseTo(50, 5);
  });

  it("ubica una cita a mitad de jornada en el porcentaje correcto", () => {
    // 13:30 local es el punto medio exacto de 9:00-18:00.
    const position = getAppointmentBlockPosition({
      startsAt: new Date("2026-07-28T17:30:00.000Z"), // 13:30 local
      endsAt: new Date("2026-07-28T18:20:00.000Z"), // 14:20 local (50 min)
      date: A_TUESDAY,
      timezone: SANTIAGO,
    });

    expect(position.topPercent).toBeCloseTo(50, 5);
  });
});

describe("getHourMarks", () => {
  it("genera una marca por cada hora en punto entre apertura y cierre, inclusive", () => {
    expect(getHourMarks()).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});
