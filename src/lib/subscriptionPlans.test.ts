import { afterEach, describe, expect, it } from "vitest";
import { getPlanFromStripePriceId, getStripePriceId } from "./subscriptionPlans";

const ENV_VARS = [
  "STRIPE_PRICE_INDIVIDUAL",
  "STRIPE_PRICE_BASICO",
  "STRIPE_PRICE_PREMIUM",
  "STRIPE_PRICE_PRO",
] as const;

describe("getStripePriceId / getPlanFromStripePriceId", () => {
  const originals = Object.fromEntries(ENV_VARS.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of ENV_VARS) {
      const original = originals[name];
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
  });

  function setPrices() {
    process.env.STRIPE_PRICE_INDIVIDUAL = "price_individual_test";
    process.env.STRIPE_PRICE_BASICO = "price_basico_test";
    process.env.STRIPE_PRICE_PREMIUM = "price_premium_test";
    process.env.STRIPE_PRICE_PRO = "price_pro_test";
  }

  it("getStripePriceId devuelve el Price id configurado para cada plan", () => {
    setPrices();
    expect(getStripePriceId("INDIVIDUAL")).toBe("price_individual_test");
    expect(getStripePriceId("BASICO")).toBe("price_basico_test");
    expect(getStripePriceId("PREMIUM")).toBe("price_premium_test");
    expect(getStripePriceId("PRO")).toBe("price_pro_test");
  });

  it("getStripePriceId tira si falta la variable de entorno del plan", () => {
    delete process.env.STRIPE_PRICE_INDIVIDUAL;
    expect(() => getStripePriceId("INDIVIDUAL")).toThrow(/STRIPE_PRICE_INDIVIDUAL/);
  });

  it("getPlanFromStripePriceId hace el mapeo inverso correcto para cada plan", () => {
    setPrices();
    expect(getPlanFromStripePriceId("price_individual_test")).toBe("INDIVIDUAL");
    expect(getPlanFromStripePriceId("price_basico_test")).toBe("BASICO");
    expect(getPlanFromStripePriceId("price_premium_test")).toBe("PREMIUM");
    expect(getPlanFromStripePriceId("price_pro_test")).toBe("PRO");
  });

  it("getPlanFromStripePriceId devuelve null (no tira) si el priceId no matchea ningún plan", () => {
    setPrices();
    expect(getPlanFromStripePriceId("price_que_no_existe")).toBeNull();
  });

  it("getPlanFromStripePriceId devuelve null si el plan no tiene variable de entorno configurada", () => {
    delete process.env.STRIPE_PRICE_INDIVIDUAL;
    expect(getPlanFromStripePriceId("price_individual_test")).toBeNull();
  });
});
