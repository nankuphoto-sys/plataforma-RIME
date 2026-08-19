import crypto from "crypto";
import { generateSecret, generateURI, verify } from "otplib";

// Verificación en dos pasos (2FA) por TOTP — app autenticadora (Google
// Authenticator/Authy), sin depender de ningún servicio externo (SMS, etc.).
// Toda la lógica pura (generar/verificar código, generar/consumir códigos de
// respaldo) vive acá, separada de las Server Actions y de authorize() en
// src/lib/auth.ts, para poder testearla sin tocar la base de datos.

const TOTP_ISSUER = "RIME";
const BACKUP_CODE_COUNT = 8;
// 5 bytes -> 10 caracteres hex, suficiente entropía (40 bits) para un código
// de un solo uso que además se invalida después de usarse una vez.
const BACKUP_CODE_BYTES = 5;
// Tolerancia de +/-1 paso (30s c/u por lado): el reloj del teléfono del
// usuario y el del servidor casi nunca están perfectamente sincronizados —
// sin esto, un código válido "a simple vista" falla por un segundo de más.
const TOTP_EPOCH_TOLERANCE: [number, number] = [1, 1];

export function generateTotpSecret(): string {
  return generateSecret();
}

// URI otpauth:// para el QR que escanea la app autenticadora. `accountLabel`
// es el email del usuario (lo que la app muestra debajo del ícono de RIME).
export function buildTotpUri(secret: string, accountLabel: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: accountLabel, secret });
}

// Solo acepta el formato exacto de un código TOTP (6 dígitos) — cualquier
// otra cosa (vacío, con espacios, un backup code de 10 caracteres hex) sale
// por acá como inválido sin gastar un ciclo de verificación criptográfica.
export async function verifyTotpCode(secret: string, token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  const result = await verify({ secret, token: trimmed, epochTolerance: TOTP_EPOCH_TOLERANCE });
  return result.valid;
}

export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(BACKUP_CODE_BYTES).toString("hex"));
}

// Nunca se guarda el código de respaldo en claro — mismo principio que
// PasswordResetToken.tokenHash: si la base se filtra, no debe alcanzar para
// desactivar el 2FA de nadie. Normaliza mayúsculas/espacios antes de
// hashear para que un usuario pegando el código con espacios o en
// mayúsculas no falle por eso.
export function hashBackupCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(code.trim().toLowerCase().replace(/\s+/g, ""))
    .digest("hex");
}

// Busca `code` entre los hashes ya guardados. Si matchea, devuelve el array
// restante (con ese código ya consumido, para persistir en una sola
// escritura) — si no matchea ninguno, devuelve null. Cada código de respaldo
// es de un solo uso: una vez consumido, ya no vuelve a aparecer en el array
// guardado.
export function consumeBackupCode(code: string, hashedCodes: string[]): string[] | null {
  const hash = hashBackupCode(code);
  const index = hashedCodes.indexOf(hash);
  if (index === -1) return null;
  return [...hashedCodes.slice(0, index), ...hashedCodes.slice(index + 1)];
}
