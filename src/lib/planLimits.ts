import type { Plan } from "@prisma/client";

// Límites y acceso a módulos por plan (Fase 6, parte 1/N + gestión de
// profesionales).
export type PlanModule =
  | "inventory"
  | "reengagement"
  | "reports"
  | "packages"
  | "waitlist"
  | "prescriptions"
  | "photos"
  | "loyalty";

export interface PlanLimits {
  maxLocations: number | null; // null = sin límite (PRO)
  maxProfessionals: number | null; // null = sin límite (PRO) — aplica solo sobre profesionales `active: true`
  modules: Record<PlanModule, boolean>;
}

// "prescriptions" (receta digital) va en `true` para los 4 planes a
// propósito, a diferencia del resto de módulos de esta tabla: es parte del
// diferenciador central del nicho de salud (ver CLAUDE.md, sección "Qué
// estamos construyendo" — "sin CIE-10, sin plantillas por especialidad" es
// exactamente el hueco que deja AgendaPro), no un upsell operativo como
// Inventario/Paquetes/Lista de espera. Queda modelado igual como
// `PlanModule` (no hardcodeado `true` en el código que lo usa) por si el
// negocio decide gatearlo más adelante.
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  INDIVIDUAL: {
    maxLocations: 1,
    maxProfessionals: 1,
    modules: {
      inventory: false,
      reengagement: false,
      reports: false,
      packages: false,
      waitlist: false,
      prescriptions: true,
      photos: false,
      loyalty: false,
    },
  },
  BASICO: {
    maxLocations: 1,
    maxProfessionals: 3,
    modules: {
      inventory: false,
      reengagement: false,
      reports: true,
      packages: false,
      waitlist: false,
      prescriptions: true,
      photos: false,
      loyalty: false,
    },
  },
  PREMIUM: {
    maxLocations: 3,
    maxProfessionals: 8,
    modules: {
      inventory: true,
      reengagement: true,
      reports: true,
      packages: true,
      waitlist: true,
      prescriptions: true,
      photos: true,
      loyalty: true,
    },
  },
  PRO: {
    maxLocations: null,
    maxProfessionals: null,
    modules: {
      inventory: true,
      reengagement: true,
      reports: true,
      packages: true,
      waitlist: true,
      prescriptions: true,
      photos: true,
      loyalty: true,
    },
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
