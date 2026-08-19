import type { Prisma } from "@prisma/client";
import { encryptField, decryptField } from "./crypto";

// Client.customFields sigue siendo una columna Json (no se tocó el schema a
// propósito — ver la nota en el PR). En vez de guardar el objeto de la ficha
// directo (texto plano en la base), se guarda envuelto en un solo campo
// cifrado: { "_enc": "<ciphertext base64 de AES-256-GCM>" }. Eso sigue siendo
// un Json válido (un objeto con una única clave string), así que no hace
// falta migración de schema ni cambiar el tipo de la columna.
const ENC_KEY = "_enc";

interface EncryptedCustomFields {
  [ENC_KEY]: string;
}

function isEncryptedShape(value: unknown): value is EncryptedCustomFields {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[ENC_KEY] === "string"
  );
}

// Cifra el objeto de la ficha (motivo de consulta, alergias, etc.) para
// guardarlo en Client.customFields. Úsalo en TODO create/update de Client
// que toque customFields — nunca escribas el objeto plano directo.
export function encryptCustomFields(fields: Record<string, unknown>): Prisma.InputJsonValue {
  return { [ENC_KEY]: encryptField(JSON.stringify(fields)) };
}

// Descifra lo que viene de Client.customFields para mostrarlo/exportarlo.
// Si `stored` no tiene la forma { _enc: ... } (dato legado en texto plano de
// antes de este cambio, o null/undefined), lo devuelve tal cual — fallback
// seguro para nunca crashear al leer datos viejos ni un error a un usuario
// del dashboard.
export function decryptCustomFields(stored: unknown): Record<string, unknown> {
  if (stored === null || stored === undefined) return {};

  if (isEncryptedShape(stored)) {
    try {
      const json = decryptField(stored[ENC_KEY]);
      const parsed = JSON.parse(json);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      // Ciphertext corrupto/manipulado o clave de cifrado distinta a la que
      // lo generó: nunca debe tumbar la página del cliente — se muestra la
      // ficha vacía en vez de un error 500.
      return {};
    }
  }

  // Dato legado en texto plano (de antes de este cambio) — se devuelve tal
  // cual, ya viene como Record<string, unknown> desde Prisma.
  if (typeof stored === "object" && !Array.isArray(stored)) {
    return stored as Record<string, unknown>;
  }
  return {};
}
