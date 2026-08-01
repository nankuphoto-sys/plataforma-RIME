import type { Plan } from "@prisma/client";

// Mapeo Plan -> monto en centavos de COP para la suscripción del SaaS vía
// Wompi. Específico de Wompi — no mezclar con subscriptionPlans.ts (Stripe).
const PRICE_ENV_VAR_BY_PLAN: Record<Plan, string> = {
  INDIVIDUAL: "WOMPI_PRICE_COP_INDIVIDUAL",
  BASICO: "WOMPI_PRICE_COP_BASICO",
  PREMIUM: "WOMPI_PRICE_COP_PREMIUM",
  PRO: "WOMPI_PRICE_COP_PRO",
};

export function getWompiPriceInCents(plan: Plan): number {
  const envVarName = PRICE_ENV_VAR_BY_PLAN[plan];
  const rawValue = process.env[envVarName];
  if (!rawValue) {
    throw new Error(`Falta la variable de entorno ${envVarName} (monto en COP para el plan ${plan}).`);
  }
  const amountInCents = Number(rawValue);
  if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
    throw new Error(`${envVarName} debe ser un número entero positivo (centavos de COP).`);
  }
  return amountInCents;
}
