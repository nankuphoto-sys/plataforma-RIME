import { PrismaClient } from "@prisma/client";

// connect_timeout/pool_timeout (2026-08-21): Neon (host serverless de
// nuestra base) suspende el cómputo tras un rato sin actividad, y
// despertarlo puede tardar más que el connect_timeout por default de
// Prisma para Postgres (5s) — encontrado investigando cold starts
// intermitentes en el login por Google (la causa real de ESE bug puntual
// terminó siendo otra, no conexión — ver el comentario del callback `jwt`
// en src/lib/auth.ts — pero el problema de cold start de Neon en sí es
// real e independiente). Subimos ambos a 20s (Vercel ya tiene
// maxDuration=60 en la ruta de auth, así que hay margen). Se arma acá,
// agregando los parámetros a la URL solo si no están ya presentes, en vez
// de editar DATABASE_URL directamente en Vercel — así no hace falta tocar
// esa env var (es "Sensitive": ni siquiera se puede leer su valor actual
// desde el dashboard para editarla con confianza).
function buildDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "20");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    return url.toString();
  } catch {
    // DATABASE_URL con un formato que URL() no puede parsear: seguir con el
    // valor tal cual en vez de romper el arranque por esto.
    return raw;
  }
}

// Reintento de conexión (restaurado 2026-08-21, con el guard correcto —
// ver historial de este archivo para el ida y vuelta completo). Neon corta
// conexiones pooled que quedan inactivas un rato; Prisma lo reporta como
// P1001/P1002/P1008/P1017 o un mensaje con "closed"/"econnreset"/
// "econnrefused"/"etimedout"/"can't reach database"/"timed out". Cualquier
// consulta de la app —incluidas las que hace @auth/prisma-adapter por su
// cuenta durante el login— puede romper con un 500 crudo si el corte pasa
// justo ahí. El intento fallido ya gatilla que Prisma reabra la conexión,
// así que reintentar la MISMA query casi siempre pasa limpio. No se
// reintenta nada que no sea este tipo de error transitorio — un error real
// de la app (constraint violado, dato inválido) sigue lanzando en el
// primer intento, sin reintentos de más.
//
// Guard crítico: NUNCA reintentar una query que es parte de una
// transacción interactiva (`prisma.$transaction(async (tx) => {...})`, ej.
// el aprovisionamiento de negocio de provisionTenantForOAuthUser en
// tenantProvisioning.ts). Se confirmó en vivo el 2026-08-21 que reintentar
// ahí adentro reabre la conexión reemplazando la de la transacción ya
// abierta, dejando a Prisma en un estado inconsistente capaz de tumbar el
// proceso entero sin ningún stack trace (ni siquiera con
// unhandledRejection/uncaughtException atrapados) — ese fue justamente el
// motivo por el que este middleware se sacó por completo un rato mientras
// se investigaba el 500 de login por Google. La causa real de ese bug
// terminó siendo otra (ver auth.ts), así que el reintento en sí nunca fue
// el problema — pero SÍ lo era reintentar dentro de una transacción, y ese
// es justo el guard que ya traía desde antes de sacarse. Se restaura con
// ese guard intacto, nunca sin él.
//
// $use (no $extends): $extends cambia el tipo del cliente resultante, lo
// que rompe la compatibilidad con Prisma.TransactionClient en decenas de
// funciones ya tipadas contra el PrismaClient estándar en todo el
// proyecto. $use es la API de middleware "clásica" (deprecada a favor de
// $extends pero todavía soportada en Prisma 5.x) — no toca el tipo del
// cliente, así que no hace falta retocar ningún otro archivo.
const RETRYABLE_PRISMA_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

function isTransientConnectionError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && RETRYABLE_PRISMA_CODES.has(code)) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /closed|econnreset|econnrefused|etimedout|can't reach database|timed out/i.test(message);
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: buildDatasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
  const MAX_ATTEMPTS = 3;
  client.$use(async (params, next) => {
    if (params.runInTransaction) return next(params);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await next(params);
      } catch (error) {
        lastError = error;
        if (attempt === MAX_ATTEMPTS || !isTransientConnectionError(error)) throw error;
      }
    }
    throw lastError;
  });
  return client;
}

// Evita crear múltiples instancias de PrismaClient en desarrollo (hot reload de Next.js)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
