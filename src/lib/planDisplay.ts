import { getPlanLimits } from "@/lib/planLimits";

export const PLAN_OPTIONS = [
  { value: "INDIVIDUAL", label: "Individual", priceUsd: 19 },
  { value: "BASICO", label: "Básico", priceUsd: 35 },
  { value: "PREMIUM", label: "Premium", priceUsd: 59 },
  { value: "PRO", label: "Pro", priceUsd: 99 },
] as const;

export function describePlan(plan: (typeof PLAN_OPTIONS)[number]): string {
  const { maxLocations, maxProfessionals } = getPlanLimits(plan.value);
  const locations = maxLocations === null ? "sedes ilimitadas" : `hasta ${maxLocations} sede(s)`;
  const professionals =
    maxProfessionals === null ? "profesionales ilimitados" : `hasta ${maxProfessionals} profesional(es) activo(s)`;
  return `USD ${plan.priceUsd}/mes — ${professionals}, ${locations}`;
}
