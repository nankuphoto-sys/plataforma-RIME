import { PrismaClient } from "@prisma/client";

// Diagnóstico temporal (2026-08-21): el login por Google seguía crasheando
// (FUNCTION_INVOCATION_FAILED, ~5s de ejecución, sin ningún stack trace)
// incluso después de arreglar el reintento para que nunca tocara una query
// dentro de una transacción abierta — mismo patrón, misma duración, en el
// mismo deploy con ese fix ya adentro. Eso descarta que el reintento DENTRO
// de la transacción sea la causa completa. Para aislar si el propio
// middleware $use (reintentar conexiones caídas) es en sí lo que
// desestabiliza el proceso —aunque solo aplique a queries FUERA de una
// transacción—, se saca por completo acá y se vuelve al PrismaClient sin
// modificar. Si el crash desaparece con esto, confirma que el reintento
// era la causa (en cuyo caso hay que reconstruirlo con más cuidado, quizás
// fuera de $use). Si el crash sigue igual, el reintento queda descartado
// del todo y hay que seguir buscando en @auth/prisma-adapter o en el
// runtime de Vercel. Restaurar el reintento (o reemplazarlo por algo más
// seguro) una vez resuelto esto.
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

// Evita crear múltiples instancias de PrismaClient en desarrollo (hot reload de Next.js)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
