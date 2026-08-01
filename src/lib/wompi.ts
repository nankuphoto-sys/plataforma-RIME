import crypto from "crypto";

// La clave privada determina el ambiente: prv_test_ = sandbox, prv_prod_ = producción.
export function getWompiApiBaseUrl(): string {
  const isSandbox = (process.env.WOMPI_PRIVATE_KEY ?? "").startsWith("prv_test_");
  return isSandbox ? "https://sandbox.wompi.co/v1" : "https://production.wompi.co/v1";
}

// Firma de integridad para Web Checkout — orden EXACTO según docs de Wompi:
// referencia + monto_en_centavos + moneda + secreto_de_integridad, concatenados
// como strings sin separadores, hasheados con SHA256 (hex).
export function generateWompiIntegritySignature(params: {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret?: string;
}): string {
  const secret = params.integritySecret ?? process.env.WOMPI_INTEGRITY_SECRET;
  if (!secret) throw new Error("Falta WOMPI_INTEGRITY_SECRET.");
  const concatenated = `${params.reference}${params.amountInCents}${params.currency}${secret}`;
  return crypto.createHash("sha256").update(concatenated).digest("hex");
}

// Lee un path anidado con puntos (ej. "transaction.id") de un objeto plano.
function getNestedValue(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

// Verifica el checksum de un evento de webhook de Wompi. `properties` viene en
// el propio evento y puede variar entre eventos — nunca se hardcodea.
export function verifyWompiWebhookChecksum(event: {
  data: unknown;
  timestamp: number;
  signature: { properties: string[]; checksum: string };
  eventsSecret?: string;
}): boolean {
  const secret = event.eventsSecret ?? process.env.WOMPI_EVENTS_SECRET;
  if (!secret) throw new Error("Falta WOMPI_EVENTS_SECRET.");

  const concatenatedValues = event.signature.properties
    .map((path) => getNestedValue(event.data, path))
    .join("");
  const concatenated = `${concatenatedValues}${event.timestamp}${secret}`;
  const expectedChecksum = crypto.createHash("sha256").update(concatenated).digest("hex");

  return expectedChecksum === event.signature.checksum;
}

interface WompiMerchantResponse {
  data: {
    presigned_acceptance: { acceptance_token: string };
    presigned_personal_data_auth: { acceptance_token: string };
  };
}

// GET /v1/merchants/{public_key} es público (sin autenticación). Devuelve los
// tokens de aceptación de términos y de tratamiento de datos personales,
// necesarios para crear un payment_source. Nombres de campo confirmados
// contra la API real de Wompi (sandbox) al escribir esta función.
export async function getWompiAcceptanceTokens(): Promise<{
  acceptanceToken: string;
  personalDataAuthToken: string;
}> {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  if (!publicKey) throw new Error("Falta WOMPI_PUBLIC_KEY.");

  const response = await fetch(`${getWompiApiBaseUrl()}/merchants/${publicKey}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`No se pudo consultar el merchant de Wompi (status ${response.status}).`);
  }

  const body = (await response.json()) as WompiMerchantResponse;
  return {
    acceptanceToken: body.data.presigned_acceptance.acceptance_token,
    personalDataAuthToken: body.data.presigned_personal_data_auth.acceptance_token,
  };
}
