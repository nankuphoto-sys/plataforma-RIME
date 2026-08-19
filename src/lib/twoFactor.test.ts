import { describe, it, expect } from "vitest";
import { generate } from "otplib";
import {
  generateTotpSecret,
  buildTotpUri,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
  consumeBackupCode,
} from "./twoFactor";

describe("twoFactor — TOTP", () => {
  it("genera un secreto distinto cada vez", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
  });

  it("arma un otpauth:// URI con el issuer y el email del usuario", () => {
    const secret = generateTotpSecret();
    const uri = buildTotpUri(secret, "dueno@negocio.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("RIME");
    expect(uri).toContain(encodeURIComponent("dueno@negocio.com"));
  });

  it("acepta un código válido generado con el mismo secreto", async () => {
    const secret = generateTotpSecret();
    const token = await generate({ secret });
    await expect(verifyTotpCode(secret, token)).resolves.toBe(true);
  });

  it("rechaza un código de 6 dígitos que no corresponde al secreto", async () => {
    const secret = generateTotpSecret();
    const otherSecret = generateTotpSecret();
    const wrongToken = await generate({ secret: otherSecret });
    await expect(verifyTotpCode(secret, wrongToken)).resolves.toBe(false);
  });

  it("rechaza cualquier cosa que no tenga forma de código de 6 dígitos", async () => {
    const secret = generateTotpSecret();
    await expect(verifyTotpCode(secret, "")).resolves.toBe(false);
    await expect(verifyTotpCode(secret, "12345")).resolves.toBe(false);
    await expect(verifyTotpCode(secret, "abcdef")).resolves.toBe(false);
    await expect(verifyTotpCode(secret, "a1b2c3d4e5")).resolves.toBe(false);
  });
});

describe("twoFactor — códigos de respaldo", () => {
  it("genera 8 códigos únicos por defecto", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
  });

  it("hashea de forma determinística, ignorando mayúsculas y espacios", () => {
    const a = hashBackupCode("aB12 cD34 eF");
    const b = hashBackupCode("ab12cd34ef");
    expect(a).toBe(b);
  });

  it("consume un código válido y lo saca de la lista guardada", () => {
    const codes = generateBackupCodes(3);
    const hashed = codes.map(hashBackupCode);

    const remaining = consumeBackupCode(codes[1], hashed);

    expect(remaining).not.toBeNull();
    expect(remaining).toHaveLength(2);
    expect(remaining).not.toContain(hashed[1]);
    expect(remaining).toContain(hashed[0]);
    expect(remaining).toContain(hashed[2]);
  });

  it("devuelve null si el código no está entre los hashes guardados", () => {
    const codes = generateBackupCodes(3);
    const hashed = codes.map(hashBackupCode);

    expect(consumeBackupCode("codigo-inventado", hashed)).toBeNull();
  });

  it("un código ya consumido no vuelve a servir (de un solo uso)", () => {
    const codes = generateBackupCodes(2);
    const hashed = codes.map(hashBackupCode);

    const afterFirstUse = consumeBackupCode(codes[0], hashed)!;
    expect(consumeBackupCode(codes[0], afterFirstUse)).toBeNull();
  });
});
