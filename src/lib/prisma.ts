import { PrismaClient } from "@prisma/client";

// Fix (2026-08-21): el login por Google crasheaba en producción
// (FUNCTION_INVOCATION_FAILED, ejecución siempre entre 5.3s y 5.9s, CERO
// logs pese a try/catch en signIn/jwt/route.ts que sí loguean a nuestra
// propia tabla ErrorLog). Ese rango de duración es casi exactamente el
// connect_timeout por default de Prisma para Postgres (5s) — y Neon (host
// serverless de nuestra base) suspende el cómputo tras un rato sin
// actividad: despertarlo puede tardar más que esos 5s. Google login es el
// flujo que más lo sufre porque se usa con menos frecuencia que Credentials,
// dando tiempo de sobra a que Neon se duerma entre intentos. Cuando la
// conexión inicial de Prisma no llega a tiempo, el rechazo ocurre dentro del
// adapter de Auth.js, fuera de cualquiera de nuestros propios try/catch —
// Node lo trata como promesa no atrapada y mata el proceso al toque, sin
// que llegue a escribirse ningún log. Ya se descartó por separado que el
// reintento de conexión (ver historial de este archivo) o los handlers de
// unhandledRejection/uncaughtException (ver historial de route.ts) sean la
// causa — este es el próximo sospechoso, y el más consistente con el patrón
// de duración observado.
//
// Subimos connect_timeout y pool_timeout a 20s cada uno (Vercel ya tiene
// maxDuration=60 en la ruta de auth, así que hay margen) para darle tiempo a
// Neon a despertar sin que el request explote. Se arma acá, agregando los
// parámetros a la URL solo si no están ya presentes, en vez de editar
// DATABASE_URL directamente en Vercel — así no hace falta tocar esa env var
// (es "Sensitive": ni siquiera se puede leer su valor actual desde el
// dashboard para editarla con confianza).
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

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: buildDatasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

// Evita crear múltiples instancias de PrismaClient en desarrollo (hot reload de Next.js)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
