import type { Plan } from "@prisma/client";

// Mapeo Plan -> id de Price de Stripe Billing (suscripción del SaaS). No
// confundir con src/lib/planLimits.ts: eso son límites/módulos de producto,
// esto son ids de facturación de Stripe.
const PRICE_ENV_VAR_BY_PLAN: Record<Plan, string> = {
  INDIVIDUAL: "STRIPE_PRICE_INDIVIDUAL",
  BASICO: "STRIPE_PRICE_BASICO",
  PREMIUM: "STRIPE_PRICE_PREMIUM",
  PRO: "STRIPE_PRICE_PRO",
};

export function getStripePriceId(plan: Plan): string {
  const envVarName = PRICE_ENV_VAR_BY_PLAN[plan];
  const priceId = process.env[envVarName];
  if (!priceId) {
    throw new Error(`Falta la variable de entorno ${envVarName} (Price de Stripe para el plan ${plan}).`);
  }
  return priceId;
}

// Mapeo inverso, usado por el webhook ante un customer.subscription.updated:
// devuelve null (no tira error) si el priceId no matchea ningún plan
// conocido — el webhook puede recibir cambios de suscripción que no son un
// cambio de plan y no debe fallar por eso.
export function getPlanFromStripePriceId(priceId: string): Plan | null {
  for (const plan of Object.keys(PRICE_ENV_VAR_BY_PLAN) as Plan[]) {
    const envVarName = PRICE_ENV_VAR_BY_PLAN[plan];
    if (process.env[envVarName] === priceId) return plan;
  }
  return null;
}
