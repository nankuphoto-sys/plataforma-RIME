import crypto from "crypto";

export const REVIEW_TOKEN_TTL_DAYS = 30;

// Token crudo que se manda por WhatsApp/email — nunca se persiste en la base,
// solo su hash (ver hashReviewToken). Mismo mecanismo que
// src/lib/passwordReset.ts, con un TTL mucho más largo (30 días en vez de 1
// hora) porque un cliente puede tardar en revisar el mensaje, y un alcance
// bastante menor si se filtrara (dejar una reseña de una cita puntual, un
// solo uso) que justifica guardar el token crudo en
// NotificationQueue.payload para que el cron arme el link recién al enviar.
export function generateRawReviewToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashReviewToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
