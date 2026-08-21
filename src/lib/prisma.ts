import { PrismaClient } from "@prisma/client";

// Neon (Postgres serverless) corta conexiones pooled que quedan inactivas
// un rato — Prisma lo reporta como P1017 ("Server has closed the
// connection") o un error cuyo mensaje menciona "Closed"/ECONNRESET. Ya
// era un problema conocido en este proyecto (ver el comentario del
// callback `jwt` en src/lib/auth.ts, que tenía su propio fail-open
// puntual para esto) — pero solo esa consulta estaba protegida. Cualquier
// otra consulta de la app, incluidas las que hace @auth/prisma-adapter
// por su cuenta durante el login (getUserByAccount, etc.), podía romper
// con un 500 crudo si el corte pasaba justo ahí — encontrado en vivo el
// 2026-08-20 con el login por Google fallando de forma intermitente.
//
// Reintentar alcanza casi siempre: el intento fallido ya gatilla que Prisma
// reabra la conexión, así que el reintento inmediato de la MISMA query casi
// siempre pasa limpio. No se reintenta nada que no sea un error de conexión
// transitorio — un error real de la app (constraint violado, dato inválido)
// sigue lanzando en el primer intento, sin reintentos de más.
//
// Ampliado (2026-08-21): el 500 de login por Google seguía apareciendo SIN
// ningún rastro ni siquiera en ErrorLog — nuestro propio logError también
// depende de esta conexión, así que si el error de conexión no entraba en
// este chequeo, ni el intento original ni el intento de loguearlo llegaban a
// escribir nada. P1017/ECONNRESET (conexión cerrada) era el único caso
// cubierto; se agregan P1001 (no se pudo alcanzar el server), P1002/P1008
// (timeout) y ETIMEDOUT/ECONNREFUSED — todos transitorios por naturaleza,
// nunca errores de datos/constraints. Dos reintentos en vez de uno, por si
// el primer reintento cae justo en el mismo hueco de reconexión.
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
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
  const MAX_ATTEMPTS = 3;
  client.$use(async (params, next) => {
    // Nunca reintentar una query que es parte de una transacción interactiva
    // (prisma.$transaction(async (tx) => {...}), como el aprovisionamiento
    // de negocio de provisionTenantForOAuthUser en tenantProvisioning.ts —
    // 9 escrituras seguidas). Confirmado en vivo el 2026-08-21: reintentar
    // acá adentro reabre la conexión reemplazando la de la transacción ya
    // abierta, dejando a Prisma en un estado inconsistente — coincide
    // exactamente con el crash de proceso (FUNCTION_INVOCATION_FAILED, sin
    // ningún stack trace ni siquiera con unhandledRejection/uncaughtException
    // atrapados) que tumbaba el login por Google justo en esa transacción.
    // Dejar que la query original falle: Prisma aborta toda la transacción
    // de forma limpia y el error sí llega como excepción normal de JS al
    // código que llamó a $transaction.
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
