import { describe, expect, it } from "vitest";
import { calculateCommissionAmount, getDefaultReportRange, parseReportDateParam } from "./reports";

describe("getDefaultReportRange", () => {
  it("devuelve el primer día del mes calendario correspondiente hasta `now`", () => {
    const now = new Date("2026-08-15T10:30:00.000Z");

    const range = getDefaultReportRange(now);

    expect(range.from).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(range.to).toEqual(now);
  });
});

describe("parseReportDateParam", () => {
  it("convierte una fecha yyyy-mm-dd válida a Date a las 00:00 UTC", () => {
    expect(parseReportDateParam("2026-08-15")).toEqual(new Date("2026-08-15T00:00:00.000Z"));
  });

  it("devuelve null para undefined", () => {
    expect(parseReportDateParam(undefined)).toBeNull();
  });

  it("devuelve null para un string que no tiene forma de fecha", () => {
    expect(parseReportDateParam("basura")).toBeNull();
  });
});

describe("calculateCommissionAmount", () => {
  it("calcula el porcentaje exacto sobre el ingreso total", () => {
    expect(calculateCommissionAmount(1000, 20)).toBe(200);
  });

  it("redondea correctamente a 2 decimales", () => {
    expect(calculateCommissionAmount(333.33, 15)).toBe(50);
  });
});
