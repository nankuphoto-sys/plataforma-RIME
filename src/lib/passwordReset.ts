import crypto from "crypto";

export const RESET_TOKEN_TTL_MINUTES = 60;
export const RESET_REQUEST_COOLDOWN_MINUTES = 2;

// Token crudo que se manda por email — nunca se persiste en la base, solo su
// hash (ver hashResetToken). Si alguien accede a la base de datos no puede
// reconstruir links de reseteo válidos a partir de lo guardado.
export function generateRawResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
