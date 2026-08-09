import { describe, expect, it } from "vitest";
import { computeChargeAmount } from "./depositPolicy";

describe("computeChargeAmount", () => {
  it("devuelve null cuando la política es NONE", () => {
    const result = computeChargeAmount(
      { depositPolicy: "NONE", depositType: null, depositValue: null },
      "50000"
    );
    expect(result).toBeNull();
  });

  it("devuelve el precio completo cuando la política es FULL_PAYMENT", () => {
    const result = computeChargeAmount(
      { depositPolicy: "FULL_PAYMENT", depositType: null, depositValue: null },
      "50000"
    );
    expect(result).toEqual({ amount: "50000.00", kind: "FULL" });
  });

  it("calcula el monto de seña por porcentaje", () => {
    const result = computeChargeAmount(
      { depositPolicy: "DEPOSIT", depositType: "PERCENTAGE", depositValue: "20" },
      "50000"
    );
    expect(result).toEqual({ amount: "10000.00", kind: "DEPOSIT" });
  });

  it("calcula el monto de seña fijo", () => {
    const result = computeChargeAmount(
      { depositPolicy: "DEPOSIT", depositType: "FIXED", depositValue: "8000" },
      "50000"
    );
    expect(result).toEqual({ amount: "8000.00", kind: "DEPOSIT" });
  });

  it("acota un porcentaje fuera de rango (>100%) al precio total del servicio", () => {
    const result = computeChargeAmount(
      { depositPolicy: "DEPOSIT", depositType: "PERCENTAGE", depositValue: "150" },
      "50000"
    );
    expect(result).toEqual({ amount: "50000.00", kind: "DEPOSIT" });
  });

  it("acota un monto fijo mayor al precio del servicio", () => {
    const result = computeChargeAmount(
      { depositPolicy: "DEPOSIT", depositType: "FIXED", depositValue: "999999" },
      "50000"
    );
    expect(result).toEqual({ amount: "50000.00", kind: "DEPOSIT" });
  });

  it("nunca cobra $0 aunque el valor configurado sea 0", () => {
    const result = computeChargeAmount(
      { depositPolicy: "DEPOSIT", depositType: "FIXED", depositValue: "0" },
      "50000"
    );
    expect(result).toEqual({ amount: "0.01", kind: "DEPOSIT" });
  });
});
