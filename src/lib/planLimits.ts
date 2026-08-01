import type { Plan } from "@prisma/client";

// Límites y acceso a módulos por plan (Fase 6, parte 1/N + gestión de
// profesionales).
export type PlanModule = "inventory" | "reengagement" | "reports";

export interface PlanLimits {
  maxLocations: number | null; // null = sin límite (PRO)
  maxProfessionals: number | null; // null = sin límite (PRO) — aplica solo sobre profesionales `active: true`
  modules: Record<PlanModule, boolean>;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  INDIVIDUAL: {
    maxLocations: 1,
    maxProfessionals: 1,
    modules: { inventory: false, reengagement: false, reports: false },
  },
  BASICO: {
    maxLocations: 1,
    maxProfessionals: 3,
    modules: { inventory: false, reengagement: false, reports: true },
  },
  PREMIUM: {
    maxLocations: 3,
    maxProfessionals: 8,
    modules: { inventory: true, reengagement: true, reports: true },
  },
  PRO: {
    maxLocations: null,
    maxProfessionals: null,
    modules: { inventory: true, reengagement: true, reports: true },
  },
};

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function planIncludesModule(plan: Plan, module: PlanModule): boolean {
  return PLAN_LIMITS[plan].modules[module];
}

export function hasReachedLocationLimit(plan: Plan, currentLocationCount: number): boolean {
  const { maxLocations } = PLAN_LIMITS[plan];
  if (maxLocations === null) return false;
  return currentLocationCount >= maxLocations;
}

export function hasReachedProfessionalLimit(plan: Plan, currentActiveCount: number): boolean {
  const { maxProfessionals } = PLAN_LIMITS[plan];
  if (maxProfessionals === null) return false;
  return currentActiveCount >= maxProfessionals;
}
