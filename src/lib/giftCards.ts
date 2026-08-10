import type { GiftCardStatus, Prisma } from "@prisma/client";

// Puras, sin acceso a base de datos — mismo criterio que canRedeemSession en
// src/lib/packages.ts.

export function isGiftCardRedeemable(
  card: { status: GiftCardStatus; balance: Prisma.Decimal | string | number; expiresAt: Date | null },
  now: Date
): boolean {
  if (card.status !== "ACTIVE") return false;
  if (Number(card.balance) <= 0) return false;
  if (card.expiresAt && card.expiresAt < now) return false;
  return true;
}

// Cuánto de la deuda cubre la gift card — nunca más de lo que tiene de saldo
// ni más de lo que se debe. Redondeado a centavos para no dejar restos de
// punto flotante en la resta posterior (ver createCheckoutSessionAction).
export function computeRedemptionAmount(balance: number, amountOwed: number): number {
  const amount = Math.min(Math.max(balance, 0), Math.max(amountOwed, 0));
  return Math.round(amount * 100) / 100;
}
