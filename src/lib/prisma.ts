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
// Reintentar UNA vez alcanza casi siempre: el intento fallido ya gatilla
// que Prisma reabra la conexión, así que el reintento inmediato de la
// MISMA query casi siempre pasa limpio. No se reintenta nada que no sea
// este error puntual — un error real de la app (constraint violado, dato
// inválido) sigue lanzando en el primer intento, sin reintentos de más.
//
// $use (no $extends): $extends cambia el tipo del cliente resultante, lo
// que rompe la compatibilidad con Prisma.TransactionClient en decenas de
// funciones ya tipadas contra el PrismaClient estándar en todo el
// proyecto. $use es la API de middleware "clásica" (deprecada a favor de
// $extends pero todavía soportada en Prisma 5.x) — no toca el tipo del
// cliente, así que no hace falta retocar ningún otro archivo.
function isClosedConnectionError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P1017") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /closed|econnreset/i.test(message);
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
  client.$use(async (params, next) => {
    try {
      return await next(params);
    } catch (error) {
      if (!isClosedConnectionError(error)) throw error;
      return await next(params);
    }
  });
  return client;
}

// Evita crear múltiples instancias de PrismaClient en desarrollo (hot reload de Next.js)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
