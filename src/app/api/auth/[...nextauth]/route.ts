import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { logError } from "@/lib/errorLog";

// Instrumentado a propósito (2026-08-21): el login por Google sigue dando
// 500 en /api/auth/callback/google en producción, pero ni Vercel (logs
// vacíos, sin stack trace) ni nuestro try/catch dentro de los callbacks
// signIn/jwt (ver src/lib/auth.ts) capturan nada — o sea el crash pasa
// DENTRO de Auth.js/el adapter, antes de llegar a nuestro propio código.
// Este wrapper envuelve el handler entero para no perder ningún error,
// venga de donde venga. Sacar una vez resuelto.
async function withErrorLogging(
  handler: (request: NextRequest) => Promise<Response>,
  request: NextRequest
): Promise<Response> {
  try {
    return await handler(request);
  } catch (error) {
    await logError(error, { where: "auth.route", url: request.url });
    throw error;
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return withErrorLogging(handlers.GET, request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return withErrorLogging(handlers.POST, request);
}
