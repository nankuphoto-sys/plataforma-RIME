import { describe, it, expect } from "vitest";
import { tenantNameConfirmsDeletion } from "./accountDeletion";

describe("tenantNameConfirmsDeletion", () => {
  it("acepta una coincidencia exacta", () => {
    expect(tenantNameConfirmsDeletion("Barbería El Estilo", "Barbería El Estilo")).toBe(true);
  });

  it("es case-sensitive", () => {
    expect(tenantNameConfirmsDeletion("barbería el estilo", "Barbería El Estilo")).toBe(false);
  });

  it("no ignora espacios de más", () => {
    expect(tenantNameConfirmsDeletion("Barbería El Estilo ", "Barbería El Estilo")).toBe(false);
  });

  it("rechaza un nombre distinto", () => {
    expect(tenantNameConfirmsDeletion("Otro negocio", "Barbería El Estilo")).toBe(false);
  });

  it("rechaza vacío", () => {
    expect(tenantNameConfirmsDeletion("", "Barbería El Estilo")).toBe(false);
  });
});
