import { describe, it, expect, beforeAll } from "vitest";
import { encryptCustomFields, decryptCustomFields } from "./clientCustomFields";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("clientCustomFields", () => {
  it("round-trips cifrado → descifrado con datos reales de ejemplo", () => {
    const fields = { Alergias: "Penicilina", "Motivo de consulta": "Ansiedad" };
    const stored = encryptCustomFields(fields);

    expect(stored).toHaveProperty("_enc");
    expect(typeof (stored as { _enc: string })._enc).toBe("string");
    // El ciphertext nunca debe contener el texto plano en claro.
    expect(JSON.stringify(stored)).not.toContain("Penicilina");

    expect(decryptCustomFields(stored)).toEqual(fields);
  });

  it("maneja con gracia un objeto legado sin _enc (texto plano) sin crashear", () => {
    const legacy = { "Motivo de consulta": "Ansiedad", Alergias: "Penicilina" };
    expect(decryptCustomFields(legacy)).toEqual(legacy);
  });

  it("maneja null sin crashear", () => {
    expect(decryptCustomFields(null)).toEqual({});
  });

  it("maneja undefined sin crashear", () => {
    expect(decryptCustomFields(undefined)).toEqual({});
  });

  it("maneja un objeto vacío sin crashear", () => {
    expect(decryptCustomFields({})).toEqual({});
  });

  it("no crashea con un ciphertext corrupto/manipulado — devuelve ficha vacía", () => {
    const stored = encryptCustomFields({ Alergias: "Penicilina" }) as { _enc: string };
    const tampered = { _enc: stored._enc.slice(0, -4) + "AAAA" };
    expect(decryptCustomFields(tampered)).toEqual({});
  });
});
