import { describe, expect, it } from "vitest";
import { computeReminderScheduledFor, formatAppointmentDateTimeLabel } from "./reminderScheduling";

describe("computeReminderScheduledFor", () => {
  it("devuelve startsAt - 24h cuando la cita es en 48h", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const startsAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const scheduledFor = computeReminderScheduledFor(startsAt, now);

    expect(scheduledFor).toEqual(new Date(startsAt.getTime() - 24 * 60 * 60 * 1000));
  });

  it("devuelve null cuando la cita es en menos de 24h", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const startsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    expect(computeReminderScheduledFor(startsAt, now)).toBeNull();
  });
});

describe("formatAppointmentDateTimeLabel", () => {
  it("formatea fecha y hora en español, con el día capitalizado", () => {
    // 2026-07-30 09:50 UTC-4 (America/Santiago) es jueves.
    const startsAt = new Date("2026-07-30T13:50:00.000Z");

    const label = formatAppointmentDateTimeLabel(startsAt, "America/Santiago");

    expect(label).toBe("Jueves, 30 de julio de 2026 a las 09:50");
  });
});
