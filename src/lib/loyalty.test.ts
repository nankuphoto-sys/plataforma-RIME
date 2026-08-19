import { describe, expect, it } from "vitest";
import { computeAvailableRewards, computeStampProgress } from "./loyalty";

describe("computeAvailableRewards", () => {
  it("devuelve 0 sin sellos", () => {
    expect(computeAvailableRewards(0, 10, 0)).toBe(0);
  });

  it("devuelve 0 justo antes del umbral", () => {
    expect(computeAvailableRewards(9, 10, 0)).toBe(0);
  });

  it("devuelve 1 justo en el umbral", () => {
    expect(computeAvailableRewards(10, 10, 0)).toBe(1);
  });

  it("resta los premios ya canjeados", () => {
    expect(computeAvailableRewards(10, 10, 1)).toBe(0);
  });

  it("acumula varios ciclos completos", () => {
    expect(computeAvailableRewards(25, 10, 0)).toBe(2);
  });

  it("nunca da negativo aunque redeemed sea mayor a lo ganado", () => {
    expect(computeAvailableRewards(5, 10, 3)).toBe(0);
  });
});

describe("computeStampProgress", () => {
  it("0 sellos -> 0 de N", () => {
    expect(computeStampProgress(0, 10, 0)).toBe(0);
  });

  it("progreso intermedio normal", () => {
    expect(computeStampProgress(7, 10, 0)).toBe(7);
  });

  it("justo en el umbral sin canjear todavía muestra el ciclo completo", () => {
    expect(computeStampProgress(10, 10, 0)).toBe(10);
  });

  it("después de canjear, el progreso vuelve a 0", () => {
    expect(computeStampProgress(10, 10, 1)).toBe(0);
  });

  it("sigue sumando progreso sobre un premio ya disponible sin canjear", () => {
    expect(computeStampProgress(13, 10, 0)).toBe(3);
  });

  it("nunca da negativo si el negocio sube stampsRequired después de canjes ya hechos con el umbral viejo", () => {
    // stamps=6, canjeó 2 premios cuando stampsRequired era 3 (rewardsRedeemed=2),
    // después el negocio subió stampsRequired a 5 desde Configuración.
    expect(computeStampProgress(6, 5, 2)).toBe(0);
  });
});
