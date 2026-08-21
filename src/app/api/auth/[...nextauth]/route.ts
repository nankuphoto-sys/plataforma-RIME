import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { logError } from "@/lib/errorLog";

// Instrumentado a propósito (2026-08-21): el login por Google sigue dando
// 500 en /api/auth/callback/google en producción, y NADA de lo agregado
// hasta ahora dejó rastro — ni el try/catch en signIn/jwt, ni el wrapper
// de acá abajo que envuelve el handler entero, ni ampliar el reintento de
// conexión de Prisma (ver src/lib/prisma.ts). Eso descarta un throw común
// de JS que se nos esté escapando por un catch mal puesto — apunta a que
// el proceso se corta de raíz (timeout de la función, o una promesa
// rechazada que nadie espera dentro de Auth.js/el adapter, que Node
// reporta como unhandledRejection en vez de propagarse por el await
// normal). Se agregan: (1) maxDuration explícito, por si el default de
// Vercel se está quedando corto con el login por Google (adapter +
// nuestras propias queries, todas seguidas); (2) handlers globales de
// unhandledRejection/uncaughtException que loguean ANTES de que el
// proceso pueda morir sin dejar nada escrito. Sacar todo este bloque una
// vez resuelto.
export const maxDuration = 60;

let processHandlersInstalled = false;
function installProcessErrorHandlers(): void {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;
  process.on("unhandledRejection", (reason) => {
    void logError(reason, { where: "auth.route.unhandledRejection" });
  });
  process.on("uncaughtException", (err) => {
    void logError(err, { where: "auth.route.uncaughtException" });
  });
}
installProcessErrorHandlers();

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
