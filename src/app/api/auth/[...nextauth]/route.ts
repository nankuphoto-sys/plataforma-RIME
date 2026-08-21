import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { logError } from "@/lib/errorLog";

// Instrumentado a propósito (2026-08-21): el login por Google sigue dando
// 500 (FUNCTION_INVOCATION_FAILED) en /api/auth/callback/google en
// producción. Hubo acá un par de process.on("unhandledRejection"/
// "uncaughtException", ...) para intentar cazar el error — se sacaron:
// Node, por default, si un error no queda atrapado por NADA, corta el
// proceso al toque y limpio. En cuanto vos registrás tu propio listener
// para esos eventos, Node deja de cortar solo — el proceso sigue vivo en
// un estado que sus propios docs describen como ya no seguro para seguir
// operando, esperando que VOS lo termines (con process.exit) — cosa que
// nuestro handler no hacía, solo intentaba loguear con `void` (fire and
// forget) y seguía de largo. En un entorno serverless eso es
// contraproducente: en vez de un crash limpio e inmediato, el proceso
// queda colgado en un estado roto hasta que la plataforma lo mata desde
// afuera — coincide con el patrón visto (siempre ~5s, siempre sin ningún
// rastro, sin cambios pese a arreglar por separado el reintento de
// Prisma). maxDuration se deja (no hace daño, por si el problema real
// termina siendo de tiempo). Sacar el resto de este comentario una vez
// resuelto.
export const maxDuration = 60;

async function withErrorLogging(
  handler: (request: NextRequest) => Promise<Response>,
  request: NextRequest
): Promise<Response> {
  const startedAt = Date.now();
  try {
    const response = await handler(request);
    const durationMs = Date.now() - startedAt;
    if (durationMs > 3000) {
      await logError(`auth route lenta: ${durationMs}ms`, { where: "auth.route.slow", url: request.url });
    }
    return response;
  } catch (error) {
    await logError(error, { where: "auth.route", url: request.url, durationMs: Date.now() - startedAt });
    throw error;
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return withErrorLogging(handlers.GET, request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return withErrorLogging(handlers.POST, request);
}
