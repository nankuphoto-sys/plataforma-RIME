import { describe, expect, it } from "vitest";
import { computeWeeklySessionStreak } from "./streak";

const DAY = 24 * 60 * 60 * 1000;

describe("computeWeeklySessionStreak", () => {
  const now = new Date("2026-08-09T00:00:00.000Z");

  it("devuelve 0 sin ninguna cita completada", () => {
    expect(computeWeeklySessionStreak([], now)).toBe(0);
  });

  it("devuelve 0 si la última cita completada fue hace más de una semana", () => {
    const eightDaysAgo = new Date(now.getTime() - 8 * DAY);
    expect(computeWeeklySessionStreak([eightDaysAgo], now)).toBe(0);
  });

  it("devuelve 1 con una sola cita esta semana", () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * DAY);
    expect(computeWeeklySessionStreak([twoDaysAgo], now)).toBe(1);
  });

  it("cuenta semanas consecutivas hacia atrás", () => {
    const thisWeek = new Date(now.getTime() - 1 * DAY);
    const lastWeek = new Date(now.getTime() - 9 * DAY);
    const twoWeeksAgo = new Date(now.getTime() - 16 * DAY);
    expect(computeWeeklySessionStreak([thisWeek, lastWeek, twoWeeksAgo], now)).toBe(3);
  });

  it("corta la racha en el primer hueco", () => {
    const thisWeek = new Date(now.getTime() - 1 * DAY);
    const lastWeek = new Date(now.getTime() - 9 * DAY);
    // semana -2 (16-23 días atrás) sin citas — hueco
    const fourWeeksAgo = new Date(now.getTime() - 30 * DAY);
    expect(computeWeeklySessionStreak([thisWeek, lastWeek, fourWeeksAgo], now)).toBe(2);
  });

  it("varias citas en la misma semana cuentan como una sola semana de racha", () => {
    const day1 = new Date(now.getTime() - 1 * DAY);
    const day2 = new Date(now.getTime() - 3 * DAY);
    expect(computeWeeklySessionStreak([day1, day2], now)).toBe(1);
  });
});
