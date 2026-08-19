import { describe, it, expect } from "vitest";
import { formatCOP, formatCOPNumber } from "./currency";

describe("formatCOP", () => {
  it("formats a whole peso amount with no decimals", () => {
    const result = formatCOP(200000);
    expect(result).toContain("200.000");
    expect(result).not.toMatch(/,|\.\d{2}$/);
  });

  it("accepts a string amount (as Decimal fields come from Prisma)", () => {
    expect(formatCOP("60000")).toContain("60.000");
  });

  it("rounds a fractional value to whole pesos", () => {
    expect(formatCOP(1500.75)).toContain("1.501");
  });
});

describe("formatCOPNumber", () => {
  it("formats without a currency symbol", () => {
    expect(formatCOPNumber(200000)).toBe("200.000");
  });
});
