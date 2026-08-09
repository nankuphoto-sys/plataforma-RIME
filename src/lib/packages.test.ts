import { describe, expect, it } from "vitest";
import {
  PACKAGE_EXPIRATION_ALERT_WINDOW_DAYS,
  canRedeemSession,
  isPackageNearingExpiration,
  remainingSessions,
} from "./packages";

describe("remainingSessions", () => {
  it("resta usadas de totales", () => {
    expect(remainingSessions({ totalSessions: 10, usedSessions: 3 })).toBe(7);
  });

  it("nunca devuelve negativo", () => {
    expect(remainingSessions({ totalSessions: 5, usedSessions: 8 })).toBe(0);
  });
});

describe("canRedeemSession", () => {
  it("permite redimir si está ACTIVE y quedan sesiones", () => {
    expect(canRedeemSession({ status: "ACTIVE", totalSessions: 10, usedSessions: 9 })).toBe(true);
  });

  it("bloquea si ya se usaron todas las sesiones", () => {
    expect(canRedeemSession({ status: "ACTIVE", totalSessions: 10, usedSessions: 10 })).toBe(false);
  });

  it("bloquea si el paquete no está ACTIVE", () => {
    expect(canRedeemSession({ status: "CANCELLED", totalSessions: 10, usedSessions: 0 })).toBe(false);
    expect(canRedeemSession({ status: "COMPLETED", totalSessions: 10, usedSessions: 10 })).toBe(false);
  });
});

describe("isPackageNearingExpiration", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");

  it("devuelve false si no tiene fecha de vencimiento", () => {
    expect(
      isPackageNearingExpiration({
        status: "ACTIVE",
        expiresAt: null,
        totalSessions: 10,
        usedSessions: 2,
        now,
      })
    ).toBe(false);
  });

  it("devuelve false si no está ACTIVE", () => {
    const expiresAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(
      isPackageNearingExpiration({
        status: "CANCELLED",
        expiresAt,
        totalSessions: 10,
        usedSessions: 2,
        now,
      })
    ).toBe(false);
  });

  it("devuelve false si ya se usaron todas las sesiones, aunque esté por vencer", () => {
    const expiresAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(
      isPackageNearingExpiration({
        status: "ACTIVE",
        expiresAt,
        totalSessions: 10,
        usedSessions: 10,
        now,
      })
    ).toBe(false);
  });

  it("devuelve false si el vencimiento ya pasó", () => {
    const expiresAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(
      isPackageNearingExpiration({
        status: "ACTIVE",
        expiresAt,
        totalSessions: 10,
        usedSessions: 2,
        now,
      })
    ).toBe(false);
  });

  it("devuelve false si el vencimiento está fuera de la ventana de aviso", () => {
    const expiresAt = new Date(
      now.getTime() + (PACKAGE_EXPIRATION_ALERT_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000
    );
    expect(
      isPackageNearingExpiration({
        status: "ACTIVE",
        expiresAt,
        totalSessions: 10,
        usedSessions: 2,
        now,
      })
    ).toBe(false);
  });

  it("devuelve true justo en el borde de la ventana de aviso", () => {
    const expiresAt = new Date(
      now.getTime() + PACKAGE_EXPIRATION_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    expect(
      isPackageNearingExpiration({
        status: "ACTIVE",
        expiresAt,
        totalSessions: 10,
        usedSessions: 2,
        now,
      })
    ).toBe(true);
  });

  it("devuelve true si vence hoy mismo", () => {
    expect(
      isPackageNearingExpiration({
        status: "ACTIVE",
        expiresAt: now,
        totalSessions: 10,
        usedSessions: 2,
        now,
      })
    ).toBe(true);
  });
});
