import type { DepositPolicy, DepositType, Prisma } from "@prisma/client";

export interface DepositPolicyInput {
  depositPolicy: DepositPolicy;
  depositType: DepositType | null;
  depositValue: Prisma.Decimal | string | number | null;
}

export interface ChargeAmount {
  amount: string;
  kind: "DEPOSIT" | "FULL";
}

// Calcula cuánto cobrar al reservar según la política del tenant.
// null = no se cobra nada online (el negocio confirma manualmente).
// El monto de una seña siempre queda acotado a [0.01, servicePrice] para que
// nunca se cobre de más (config inválida) ni un monto de $0.
export function computeChargeAmount(
  tenant: DepositPolicyInput,
  servicePrice: Prisma.Decimal | string | number
): ChargeAmount | null {
  const price = Number(servicePrice);

  if (tenant.depositPolicy === "NONE") return null;

  if (tenant.depositPolicy === "FULL_PAYMENT") {
    return { amount: price.toFixed(2), kind: "FULL" };
  }

  // DEPOSIT
  const value = Number(tenant.depositValue ?? 0);
  const rawAmount =
    tenant.depositType === "PERCENTAGE" ? price * (value / 100) : value;
  const clamped = Math.min(Math.max(rawAmount, 0.01), price);

  return { amount: clamped.toFixed(2), kind: "DEPOSIT" };
}
