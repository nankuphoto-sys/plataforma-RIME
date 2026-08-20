import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Diagnóstico TEMPORAL — mide desde el servidor en vivo (misma región que
// las funciones reales) cuánto tarda de verdad la conexión a Neon y la
// llamada de red a Google, para encontrar dónde se está colgando el login
// por Google (2026-08-20). Se borra apenas se resuelve, no es parte
// permanente de la app. Protegido con CRON_SECRET (mismo patrón que los
// crons) para que no quede un endpoint público sin sentido.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number; ok: boolean; error?: string; result?: unknown }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { label, ms: Date.now() - start, ok: true, result };
  } catch (error) {
    return { label, ms: Date.now() - start, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const results = [];

  results.push(await timed("db_select_1", () => prisma.$queryRawUnsafe("select 1")));

  results.push(
    await timed("db_select_1_second_query", () => prisma.$queryRawUnsafe("select 1"))
  );

  results.push(
    await timed("google_token_endpoint_reachability", async () => {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "grant_type=authorization_code&code=diagnostic&client_id=x&client_secret=x&redirect_uri=x",
      });
      return { status: res.status };
    })
  );

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? "desconocida",
    results,
  });
}
