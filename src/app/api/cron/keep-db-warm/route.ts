import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Neon suspende el compute de la base tras un rato sin uso — la primera
// consulta después de eso tarda ~2s en "despertarla" (medido en vivo el
// 2026-08-20: 2070ms la primera consulta, 3ms la segunda). El login por
// Google hace varias consultas seguidas (el adapter de Auth.js + las
// nuestras) justo en ese arranque en frío, y ahí es donde algunas se
// cortaban con 500. Este cron solo hace un ping liviano cada pocos
// minutos para que la base nunca llegue a suspenderse durante horario de
// uso real.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  await prisma.$queryRawUnsafe("select 1");

  return NextResponse.json({ ok: true });
}
