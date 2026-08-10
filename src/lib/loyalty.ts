// Fidelidad con sellos: Client.loyaltyStamps se acumula de por vida (nunca
// se resetea), así que tanto los premios disponibles como el progreso hacia
// el próximo se calculan siempre a partir de él — nada de esto se guarda en
// la base. Puras, sin acceso a base de datos — mismo criterio que
// remainingSessions en src/lib/packages.ts.

export function computeAvailableRewards(
  stamps: number,
  stampsRequired: number,
  rewardsRedeemed: number
): number {
  if (stampsRequired <= 0) return 0;
  return Math.max(0, Math.floor(stamps / stampsRequired) - rewardsRedeemed);
}

// Sellos acumulados hacia el próximo premio, 0..stampsRequired. Resta los
// sellos ya "consumidos" por premios canjeados (rewardsRedeemed *
// stampsRequired) antes de calcular el resto — así un premio recién ganado
// pero todavía sin canjear se ve como el ciclo COMPLETO (ej. "3 de 3"), no
// como si hubiera vuelto a 0, hasta que el negocio lo canjea de verdad.
export function computeStampProgress(
  stamps: number,
  stampsRequired: number,
  rewardsRedeemed: number
): number {
  if (stampsRequired <= 0) return 0;
  const unconsumed = stamps - rewardsRedeemed * stampsRequired;
  const remainder = unconsumed % stampsRequired;
  return remainder === 0 && unconsumed > 0 ? stampsRequired : remainder;
}
