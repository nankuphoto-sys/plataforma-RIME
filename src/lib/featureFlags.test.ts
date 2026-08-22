import { afterEach, describe, expect, it, vi } from "vitest";

describe("STRIPE_ENABLED", () => {
  const originalValue = process.env.STRIPE_ENABLED;

  afterEach(() => {
    if (originalValue === undefined) delete process.env.STRIPE_ENABLED;
    else process.env.STRIPE_ENABLED = originalValue;
  });

  it("es true por default, sin la variable de entorno configurada", async () => {
    delete process.env.STRIPE_ENABLED;
    vi.resetModules();
    const { STRIPE_ENABLED } = await import("./featureFlags");
    expect(STRIPE_ENABLED).toBe(true);
  });

  it("es false cuando STRIPE_ENABLED=\"false\"", async () => {
    process.env.STRIPE_ENABLED = "false";
    vi.resetModules();
    const { STRIPE_ENABLED } = await import("./featureFlags");
    expect(STRIPE_ENABLED).toBe(false);
  });

  it("es true para cualquier otro valor que no sea exactamente \"false\"", async () => {
    process.env.STRIPE_ENABLED = "true";
    vi.resetModules();
    const mod = await import("./featureFlags");
    expect(mod.STRIPE_ENABLED).toBe(true);
  });
});
