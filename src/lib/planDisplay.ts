import { getPlanLimits } from "@/lib/planLimits";
import { formatCOP } from "@/lib/currency";

// Mismo monto que STRIPE_PRICE_*/WOMPI_PRICE_COP_* en .env (en pesos, no
// centavos) — ver ese comentario para el origen del cálculo.
export const PLAN_OPTIONS = [
  { value: "INDIVIDUAL", label: "Individual", priceCop: 60000 },
  { value: "BASICO", label: "Básico", priceCop: 110000 },
  { value: "PREMIUM", label: "Premium", priceCop: 186000 },
  { value: "PRO", label: "Pro", priceCop: 312000 },
] as const;

export function describePlan(plan: (typeof PLAN_OPTIONS)[number]): string {
  const { maxLocations, maxProfessionals } = getPlanLimits(plan.value);
  const locations = maxLocations === null ? "sedes ilimitadas" : `hasta ${maxLocations} sede(s)`;
  const professionals =
    maxProfessionals === null ? "profesionales ilimitados" : `hasta ${maxProfessionals} profesional(es) activo(s)`;
  return `${formatCOP(plan.priceCop)}/mes — ${professionals}, ${locations}`;
}
