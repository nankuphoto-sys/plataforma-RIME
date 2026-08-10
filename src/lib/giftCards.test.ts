import { describe, expect, it } from "vitest";
import { computeRedemptionAmount, isGiftCardRedeemable } from "./giftCards";

describe("isGiftCardRedeemable", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  it("es redimible si está ACTIVE, con saldo y sin vencer", () => {
    expect(isGiftCardRedeemable({ status: "ACTIVE", balance: "50", expiresAt: null }, now)).toBe(true);
  });

  it("no es redimible si está CANCELLED", () => {
    expect(isGiftCardRedeemable({ status: "CANCELLED", balance: "50", expiresAt: null }, now)).toBe(false);
  });

  it("no es redimible si está DEPLETED", () => {
    expect(isGiftCardRedeemable({ status: "DEPLETED", balance: "0", expiresAt: null }, now)).toBe(false);
  });

  it("no es redimible con saldo 0 aunque el status siga ACTIVE", () => {
    expect(isGiftCardRedeemable({ status: "ACTIVE", balance: "0", expiresAt: null }, now)).toBe(false);
  });

  it("no es redimible si ya venció", () => {
    expect(
      isGiftCardRedeemable({ status: "ACTIVE", balance: "50", expiresAt: new Date("2026-01-01") }, now)
    ).toBe(false);
  });

  it("es redimible si el vencimiento todavía no llegó", () => {
    expect(
      isGiftCardRedeemable({ status: "ACTIVE", balance: "50", expiresAt: new Date("2026-12-31") }, now)
    ).toBe(true);
  });
});

describe("computeRedemptionAmount", () => {
  it("cubre todo cuando el saldo alcanza y sobra", () => {
    expect(computeRedemptionAmount(100, 35)).toBe(35);
  });

  it("cubre solo lo que tiene cuando el saldo es menor a lo debido", () => {
    expect(computeRedemptionAmount(20, 35)).toBe(20);
  });

  it("cubre exactamente cuando coinciden", () => {
    expect(computeRedemptionAmount(35, 35)).toBe(35);
  });

  it("nunca da negativo con saldo 0", () => {
    expect(computeRedemptionAmount(0, 35)).toBe(0);
  });

  it("redondea a centavos", () => {
    expect(computeRedemptionAmount(10.006, 20)).toBe(10.01);
  });
});
