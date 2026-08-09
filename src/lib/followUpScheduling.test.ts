import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_INTERVAL_DAYS,
  computeFollowUpSlot,
  isAutoFollowUpVertical,
  isFollowUpSlotFree,
} from "./followUpScheduling";

describe("isAutoFollowUpVertical", () => {
  it("es true para las 3 verticales de salud", () => {
    expect(isAutoFollowUpVertical("PSICOLOGIA")).toBe(true);
    expect(isAutoFollowUpVertical("NUTRICION")).toBe(true);
    expect(isAutoFollowUpVertical("FISIOTERAPIA")).toBe(true);
  });

  it("es false para verticales no clínicas", () => {
    expect(isAutoFollowUpVertical("GENERAL")).toBe(false);
    expect(isAutoFollowUpVertical("ESTETICA")).toBe(false);
    expect(isAutoFollowUpVertical("BARBERIA")).toBe(false);
  });
});

describe("computeFollowUpSlot", () => {
  it("suma FOLLOW_UP_INTERVAL_DAYS manteniendo la misma hora del día", () => {
    const original = new Date("2026-08-01T15:00:00.000Z");
    const slot = computeFollowUpSlot(original, 45);

    const expectedStart = new Date(original.getTime() + FOLLOW_UP_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
    expect(slot.startsAt.getTime()).toBe(expectedStart.getTime());
    expect(slot.startsAt.getUTCHours()).toBe(original.getUTCHours());
    expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(45 * 60_000);
  });
});

describe("isFollowUpSlotFree", () => {
  const candidate = { startsAt: new Date("2026-08-15T15:00:00.000Z"), endsAt: new Date("2026-08-15T15:45:00.000Z") };

  it("devuelve true sin citas existentes", () => {
    expect(isFollowUpSlotFree(candidate, [])).toBe(true);
  });

  it("devuelve true si las citas existentes no se solapan", () => {
    const other = { startsAt: new Date("2026-08-15T16:00:00.000Z"), endsAt: new Date("2026-08-15T16:45:00.000Z") };
    expect(isFollowUpSlotFree(candidate, [other])).toBe(true);
  });

  it("devuelve false si hay una cita que se solapa exactamente", () => {
    expect(isFollowUpSlotFree(candidate, [candidate])).toBe(false);
  });

  it("devuelve false si hay una cita que se solapa parcialmente", () => {
    const overlapping = { startsAt: new Date("2026-08-15T15:30:00.000Z"), endsAt: new Date("2026-08-15T16:15:00.000Z") };
    expect(isFollowUpSlotFree(candidate, [overlapping])).toBe(false);
  });
});
