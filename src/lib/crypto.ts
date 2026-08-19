import crypto from "crypto";

// Cifrado a nivel de aplicación para campos sensibles (ficha de salud del
// cliente, secreto TOTP de 2FA) — capa adicional sobre el cifrado en
// tránsito/reposo que ya da la infraestructura (TLS, at-rest de Neon).
// AES-256-GCM: autenticado, así que un ciphertext manipulado falla al
// descifrar en vez de devolver basura silenciosamente.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado para GCM

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY no está configurada.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY debe decodificar a 32 bytes (AES-256).");
  }
  return key;
}

// Devuelve iv + authTag + ciphertext concatenados en un solo string base64,
// para que quepa en cualquier columna String existente sin cambiar el
// schema.
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptField(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
