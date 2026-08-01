import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/health -> verifica que la app y la conexión a la base de datos estén vivas.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (error) {
    return NextResponse.json(
      { status: "error", db: "disconnected", message: (error as Error).message },
      { status: 500 }
    );
  }
}
