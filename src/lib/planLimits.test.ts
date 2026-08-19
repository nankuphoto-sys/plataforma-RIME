import { describe, expect, it } from "vitest";
import {
  getPlanLimits,
  hasReachedLocationLimit,
  hasReachedProfessionalLimit,
  planIncludesModule,
} from "./planLimits";

describe("getPlanLimits", () => {
  it("devuelve los límites configurados para cada plan", () => {
    expect(getPlanLimits("INDIVIDUAL").maxLocations).toBe(1);
    expect(getPlanLimits("BASICO").maxLocations).toBe(1);
    expect(getPlanLimits("PREMIUM").maxLocations).toBe(3);
    expect(getPlanLimits("PRO").maxLocations).toBeNull();
  });
});

describe("planIncludesModule", () => {
  it("INDIVIDUAL no incluye ningún módulo excepto prescriptions", () => {
    expect(planIncludesModule("INDIVIDUAL", "inventory")).toBe(false);
    expect(planIncludesModule("INDIVIDUAL", "reengagement")).toBe(false);
    expect(planIncludesModule("INDIVIDUAL", "reports")).toBe(false);
    expect(planIncludesModule("INDIVIDUAL", "packages")).toBe(false);
    expect(planIncludesModule("INDIVIDUAL", "waitlist")).toBe(false);
    expect(planIncludesModule("INDIVIDUAL", "photos")).toBe(false);
    expect(planIncludesModule("INDIVIDUAL", "aiAssistant")).toBe(false);
    expect(planIncludesModule("INDIVIDUAL", "prescriptions")).toBe(true);
  });

  it("BASICO solo incluye reports (y prescriptions, disponible en todos los planes)", () => {
    expect(planIncludesModule("BASICO", "inventory")).toBe(false);
    expect(planIncludesModule("BASICO", "reengagement")).toBe(false);
    expect(planIncludesModule("BASICO", "reports")).toBe(true);
    expect(planIncludesModule("BASICO", "packages")).toBe(false);
    expect(planIncludesModule("BASICO", "waitlist")).toBe(false);
    expect(planIncludesModule("BASICO", "photos")).toBe(false);
    expect(planIncludesModule("BASICO", "aiAssistant")).toBe(false);
    expect(planIncludesModule("BASICO", "prescriptions")).toBe(true);
  });

  it("PREMIUM y PRO incluyen todos los módulos", () => {
    for (const plan of ["PREMIUM", "PRO"] as const) {
      expect(planIncludesModule(plan, "inventory")).toBe(true);
      expect(planIncludesModule(plan, "reengagement")).toBe(true);
      expect(planIncludesModule(plan, "reports")).toBe(true);
      expect(planIncludesModule(plan, "packages")).toBe(true);
      expect(planIncludesModule(plan, "waitlist")).toBe(true);
      expect(planIncludesModule(plan, "photos")).toBe(true);
      expect(planIncludesModule(plan, "aiAssistant")).toBe(true);
      expect(planIncludesModule(plan, "prescriptions")).toBe(true);
    }
  });

  it("prescriptions está disponible en los 4 planes (diferenciador de nicho, no upsell)", () => {
    for (const plan of ["INDIVIDUAL", "BASICO", "PREMIUM", "PRO"] as const) {
      expect(planIncludesModule(plan, "prescriptions")).toBe(true);
    }
  });
});

describe("hasReachedLocationLimit", () => {
  it("devuelve true cuando ya se alcanzó el máximo de sedes del plan", () => {
    expect(hasReachedLocationLimit("BASICO", 1)).toBe(true);
    expect(hasReachedLocationLimit("PREMIUM", 3)).toBe(true);
  });

  it("devuelve false cuando todavía hay lugar", () => {
    expect(hasReachedLocationLimit("BASICO", 0)).toBe(false);
    expect(hasReachedLocationLimit("PREMIUM", 2)).toBe(false);
  });

  it("PRO nunca alcanza el límite (sin tope)", () => {
    expect(hasReachedLocationLimit("PRO", 1000)).toBe(false);
  });
});

describe("hasReachedProfessionalLimit", () => {
  it("devuelve true cuando ya se alcanzó el máximo de profesionales activos del plan", () => {
    expect(hasReachedProfessionalLimit("INDIVIDUAL", 1)).toBe(true);
    expect(hasReachedProfessionalLimit("BASICO", 3)).toBe(true);
    expect(hasReachedProfessionalLimit("PREMIUM", 8)).toBe(true);
  });

  it("devuelve false cuando todavía hay lugar", () => {
    expect(hasReachedProfessionalLimit("INDIVIDUAL", 0)).toBe(false);
    expect(hasReachedProfessionalLimit("BASICO", 2)).toBe(false);
    expect(hasReachedProfessionalLimit("PREMIUM", 7)).toBe(false);
  });

  it("PRO nunca alcanza el límite (sin tope)", () => {
    expect(hasReachedProfessionalLimit("PRO", 1000)).toBe(false);
  });
});
