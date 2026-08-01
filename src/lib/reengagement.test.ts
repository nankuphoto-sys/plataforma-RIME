import { describe, expect, it } from "vitest";
import { INACTIVITY_THRESHOLD_DAYS, isClientInactive } from "./reengagement";

describe("isClientInactive", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");

  it("devuelve false si el cliente nunca tuvo una cita completada", () => {
    expect(
      isClientInactive({ lastCompletedAppointmentAt: null, hasUpcomingAppointment: false, now })
    ).toBe(false);
  });

  it("devuelve false si tiene una cita futura agendada, aunque esté inactivo hace mucho", () => {
    const lastCompletedAppointmentAt = new Date(
      now.getTime() - 365 * 24 * 60 * 60 * 1000
    );
    expect(
      isClientInactive({ lastCompletedAppointmentAt, hasUpcomingAppointment: true, now })
    ).toBe(false);
  });

  it("devuelve false justo debajo del umbral de inactividad", () => {
    const lastCompletedAppointmentAt = new Date(
      now.getTime() - (INACTIVITY_THRESHOLD_DAYS - 1) * 24 * 60 * 60 * 1000
    );
    expect(
      isClientInactive({ lastCompletedAppointmentAt, hasUpcomingAppointment: false, now })
    ).toBe(false);
  });

  it("devuelve true justo en el umbral de inactividad sin cita futura", () => {
    const lastCompletedAppointmentAt = new Date(
      now.getTime() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
    );
    expect(
      isClientInactive({ lastCompletedAppointmentAt, hasUpcomingAppointment: false, now })
    ).toBe(true);
  });

  it("devuelve true muy por encima del umbral sin cita futura", () => {
    const lastCompletedAppointmentAt = new Date(
      now.getTime() - (INACTIVITY_THRESHOLD_DAYS + 30) * 24 * 60 * 60 * 1000
    );
    expect(
      isClientInactive({ lastCompletedAppointmentAt, hasUpcomingAppointment: false, now })
    ).toBe(true);
  });
});
