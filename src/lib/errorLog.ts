import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ErrorLogContext {
  tenantId?: string;
  [key: string]: unknown;
}

// Separa message/stack tanto de un Error real como de cualquier otra cosa
// que alguien haya hecho `throw` (string, objeto plano, etc.) — JS no obliga
// a que lo lanzado sea un Error, y un catch(error: unknown) tiene que
// bancarse ambos casos sin explotar.
function describeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }
  if (typeof error === "string") {
    return { message: error, stack: null };
  }
  try {
    return { message: JSON.stringify(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

// Escribe una fila en ErrorLog. A propósito NUNCA lanza: esta función se
// llama desde catch blocks (incluyendo los de los webhooks de pago) y desde
// error boundaries — si logError() en sí fallara (ej. la base de datos está
// caída, justo el escenario en el que más se necesita no romper nada más),
// dejar que esa excepción se propagara podría tumbar al llamador (o, en un
// error boundary de Next.js, disparar un loop de errores). Cualquier falla
// acá se atrapa y como mucho se deja constancia con console.error.
async function writeLog(level: "error" | "warn", message: string, stack: string | null, context?: ErrorLogContext): Promise<void> {
  try {
    const { tenantId, ...rest } = context ?? {};
    await prisma.errorLog.create({
      data: {
        level,
        message,
        stack,
        tenantId: tenantId ?? null,
        context: Object.keys(rest).length > 0 ? (rest as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (loggingError) {
    // Última línea de defensa: si ni siquiera se pudo escribir el log, que
    // quede al menos en la consola del server (Vercel lo captura en sus
    // propios logs de runtime), pero jamás propagar hacia quien llamó a
    // logError/logWarning.
    console.error("[errorLog] no se pudo escribir el log en la base de datos:", loggingError);
    console.error("[errorLog] error original que se intentaba registrar:", message, stack);
  }
}

export async function logError(error: unknown, context?: ErrorLogContext): Promise<void> {
  const { message, stack } = describeError(error);
  await writeLog("error", message, stack, context);
}

export async function logWarning(message: string, context?: ErrorLogContext): Promise<void> {
  await writeLog("warn", message, null, context);
}
