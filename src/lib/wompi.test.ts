import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { generateWompiIntegritySignature, verifyWompiWebhookChecksum } from "./wompi";

describe("generateWompiIntegritySignature", () => {
  it("genera el hash exacto del caso de prueba de la documentación oficial de Wompi", () => {
    // reference + amountInCents + currency + integritySecret concatenados sin
    // separadores: "sk8-438k4-xmxm392-sn2m2490000COPprod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6"
    const signature = generateWompiIntegritySignature({
      reference: "sk8-438k4-xmxm392-sn2m",
      amountInCents: 2490000,
      currency: "COP",
      integritySecret: "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6",
    });

    expect(signature).toBe(
      "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5"
    );
  });
});

describe("verifyWompiWebhookChecksum", () => {
  const eventsSecret = "test_events_secret_de_ejemplo";
  const timestamp = 1532941443;
  const data = {
    transaction: {
      id: "1234-5678-9012",
      status: "APPROVED",
      amount_in_cents: 4490000,
      reference: "cita-abc-1700000000000",
    },
  };
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

  function computeChecksum(): string {
    const concatenated =
      properties.map((path) => path.split(".").reduce<unknown>((v, k) => (v as never)[k], data)).join("") +
      timestamp +
      eventsSecret;
    return crypto.createHash("sha256").update(concatenated).digest("hex");
  }

  it("acepta un payload cuyo checksum fue calculado correctamente", () => {
    const checksum = computeChecksum();

    const isValid = verifyWompiWebhookChecksum({
      data,
      timestamp,
      signature: { properties, checksum },
      eventsSecret,
    });

    expect(isValid).toBe(true);
  });

  it("rechaza un payload cuyo checksum fue alterado", () => {
    const checksum = computeChecksum();
    const tamperedChecksum = checksum.slice(0, -1) + (checksum.at(-1) === "0" ? "1" : "0");

    const isValid = verifyWompiWebhookChecksum({
      data,
      timestamp,
      signature: { properties, checksum: tamperedChecksum },
      eventsSecret,
    });

    expect(isValid).toBe(false);
  });

  it("rechaza el payload si los datos cambiaron pero el checksum quedó viejo", () => {
    const checksum = computeChecksum();
    const tamperedData = {
      transaction: { ...data.transaction, status: "DECLINED" },
    };

    const isValid = verifyWompiWebhookChecksum({
      data: tamperedData,
      timestamp,
      signature: { properties, checksum },
      eventsSecret,
    });

    expect(isValid).toBe(false);
  });
});
