import type { SessionPackageStatus } from "@prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PACKAGE_EXPIRATION_ALERT_WINDOW_DAYS = 7;
export const PACKAGE_EXPIRATION_ALERT_COOLDOWN_DAYS = 90;

export function remainingSessions(params: { totalSessions: number; usedSessions: number }): number {
  return Math.max(0, params.totalSessions - params.usedSessions);
}

// Solo se puede redimir una sesión de un paquete ACTIVE que todavía tenga
// sesiones disponibles — no se bloquea por fecha de vencimiento vencida en
// esta fase (marcar EXPIRED automáticamente queda fuera, ver CLAUDE.md).
export function canRedeemSession(params: {
  status: SessionPackageStatus;
  totalSessions: number;
  usedSessions: number;
}): boolean {
  return params.status === "ACTIVE" && params.usedSessions < params.totalSessions;
}

// Un paquete es candidato a la alerta de vencimiento cuando está ACTIVE,
// tiene fecha de vencimiento configurada, todavía le quedan sesiones sin
// usar, y esa fecha cae dentro de la ventana de aviso (hoy o hasta
// PACKAGE_EXPIRATION_ALERT_WINDOW_DAYS días en el futuro) — una vez que la
// fecha ya pasó deja de ser "por vencer" y no se alerta más en esta fase.
// Pura, sin acceso a base de datos — mismo criterio que isClientInactive en
// src/lib/reengagement.ts.
export function isPackageNearingExpiration(params: {
  status: SessionPackageStatus;
  expiresAt: Date | null;
  totalSessions: number;
  usedSessions: number;
  now: Date;
}): boolean {
  const { status, expiresAt, totalSessions, usedSessions, now } = params;

  if (status !== "ACTIVE") return false;
  if (!expiresAt) return false;
  if (usedSessions >= totalSessions) return false;

  const daysUntilExpiration = (expiresAt.getTime() - now.getTime()) / MS_PER_DAY;
  return daysUntilExpiration >= 0 && daysUntilExpiration <= PACKAGE_EXPIRATION_ALERT_WINDOW_DAYS;
}
