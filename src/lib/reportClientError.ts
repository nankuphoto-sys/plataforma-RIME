"use server";

import { logError } from "@/lib/errorLog";

// Wrapper mínimo para poder llamar a logError() desde los error boundaries
// del App Router (src/app/error.tsx y src/app/global-error.tsx), que son
// Client Components. errorLog.ts importa "@/lib/prisma" (PrismaClient, solo
// corre en Node) — si un Client Component lo importara directo, ese código
// terminaría empaquetado para el browser y rompería el build. Server Action
// ("use server") es el puente estándar de Next.js para cruzar de client a
// server sin exponer nada de Prisma al bundle del cliente.
//
// Recibe message/stack ya extraídos como strings planos en vez del objeto
// Error tal cual, porque los argumentos de una Server Action invocada desde
// el cliente viajan serializados por el canal de React Server Components —
// un Error real no es parte del set de tipos serializables garantizados ahí,
// un string sí. Del lado del servidor se reconstruye un Error para reusar
// exactamente la misma lógica de extracción que logError ya tiene.
export async function reportClientError(
  message: string,
  stack: string | undefined,
  context?: { tenantId?: string; [key: string]: unknown }
): Promise<void> {
  const error = new Error(message);
  if (stack) error.stack = stack;
  await logError(error, context);
}
