import { describe, it, expect, beforeAll } from "vitest";
import { encryptField, decryptField } from "./crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("crypto", () => {
  it("round-trips a plaintext value", () => {
    const plaintext = "Alergia a la penicilina — cliente sensible.";
    const ciphertext = encryptField(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decryptField(ciphertext)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptField("mismo texto");
    const b = encryptField("mismo texto");
    expect(a).not.toBe(b);
  });

  it("throws on a tampered ciphertext instead of returning garbage", () => {
    const ciphertext = encryptField("dato sensible");
    const tampered = ciphertext.slice(0, -4) + "AAAA";
    expect(() => decryptField(tampered)).toThrow();
  });
});
