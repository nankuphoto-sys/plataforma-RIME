import { describe, expect, it } from "vitest";
import { TenantVertical } from "@prisma/client";
import { CLIENT_FIELD_TEMPLATES, getClientFieldTemplate } from "./clientFieldTemplates";

describe("CLIENT_FIELD_TEMPLATES", () => {
  it("tiene una plantilla definida para cada valor del enum TenantVertical", () => {
    for (const vertical of Object.values(TenantVertical)) {
      const template = CLIENT_FIELD_TEMPLATES[vertical];
      expect(template).toBeDefined();
      expect(Array.isArray(template)).toBe(true);
    }
  });
});

describe("getClientFieldTemplate", () => {
  it("devuelve la plantilla correspondiente a la vertical pedida", () => {
    expect(getClientFieldTemplate("NUTRICION")).toBe(CLIENT_FIELD_TEMPLATES.NUTRICION);
  });
});
