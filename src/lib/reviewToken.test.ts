import { describe, expect, it } from "vitest";
import { generateRawReviewToken, hashReviewToken } from "./reviewToken";

describe("generateRawReviewToken", () => {
  it("genera tokens distintos en cada llamada", () => {
    const a = generateRawReviewToken();
    const b = generateRawReviewToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe("hashReviewToken", () => {
  it("es determinístico para el mismo token", () => {
    const raw = generateRawReviewToken();
    expect(hashReviewToken(raw)).toBe(hashReviewToken(raw));
  });

  it("produce hashes distintos para tokens distintos", () => {
    const a = generateRawReviewToken();
    const b = generateRawReviewToken();
    expect(hashReviewToken(a)).not.toBe(hashReviewToken(b));
  });
});
