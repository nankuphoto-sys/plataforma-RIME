// Hook oficial de Next.js (src/instrumentation.ts, sin flag experimental
// necesario en Next 15): register() corre una sola vez por arranque frío del
// runtime Node, antes de que llegue cualquier request — el lugar correcto
// para instalar handlers globales de proceso, a diferencia de hacerlo a nivel
// de módulo en una ruta (src/app/api/auth/[...nextauth]/route.ts lo tuvo así
// y se sacó el 2026-08-21, ver el historial de ese archivo).
//
// Reinstrumentado (2026-08-21) para investigar el 500
// (FUNCTION_INVOCATION_FAILED) del login/registro con Google en producción,
// que sigue sin resolverse pese a varios intentos previos. La vez anterior
// que se probó esto, se sacó porque el handler solo hacía `void logError(...)`
// (escritura async a NUESTRA base vía Prisma) sin esperar a que terminara ni
// cortar el proceso después — dejaba el proceso vivo en un estado que Node
// documenta como ya no seguro, esperando un process.exit() que nunca llegaba,
// hasta que la plataforma lo mataba desde afuera sin que la escritura
// llegara a completarse nunca. Esta versión corrige las dos partes de ese
// problema:
//   1. Loguea con console.error (va directo al stdout que Vercel captura en
//      sus runtime logs) en vez de depender de otra escritura a Prisma — si
//      la causa real termina siendo justamente un problema de conexión a la
//      base, un segundo intento de escribir el log por Prisma podría fallar
//      exactamente igual y nunca dejar rastro.
//   2. Llama a process.exit(1) inmediatamente después de loguear, para
//      restaurar el mismo comportamiento "crashea rápido y limpio" que Node
//      hace por default cuando nadie escucha estos eventos — nunca deja el
//      proceso colgado.
// Sacar este archivo (o al menos este bloque) una vez que el login con
// Google esté confirmado estable en producción.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  process.on("unhandledRejection", (reason) => {
    console.error("[FATAL unhandledRejection]", reason);
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    console.error("[FATAL uncaughtException]", error);
    process.exit(1);
  });
}
