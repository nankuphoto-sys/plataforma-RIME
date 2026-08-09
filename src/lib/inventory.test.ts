import { describe, expect, it } from "vitest";
import { crossedLowStockThreshold } from "./inventory";

describe("crossedLowStockThreshold", () => {
  it("detecta el cruce cuando el stock pasa de por encima del umbral a en/por debajo", () => {
    expect(crossedLowStockThreshold(10, 3, 5)).toBe(true); // 10 > 5, 3 <= 5
    expect(crossedLowStockThreshold(6, 5, 5)).toBe(true); // 6 > 5, 5 <= 5 (justo en el umbral)
  });

  it("no dispara si el stock ya estaba en o por debajo del umbral antes del movimiento", () => {
    expect(crossedLowStockThreshold(5, 2, 5)).toBe(false); // ya estaba en el umbral
    expect(crossedLowStockThreshold(3, 1, 5)).toBe(false); // ya estaba por debajo
  });

  it("no dispara si el stock sigue por encima del umbral después del movimiento", () => {
    expect(crossedLowStockThreshold(20, 15, 5)).toBe(false);
  });

  it("funciona igual con stock resultante negativo (más allá del umbral)", () => {
    expect(crossedLowStockThreshold(2, -3, 0)).toBe(true);
  });
});
