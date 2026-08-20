import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Diagnóstico TEMPORAL #2 — simula la secuencia real de consultas del
// aprovisionamiento por Google (provisionTenantForOAuthUser), midiendo
// cada paso por separado, dentro de una transacción que se aborta a
// propósito al final (throw) para no dejar datos de prueba. Se borra
// apenas se resuelva.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

class RollbackMarker extends Error {}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const steps: { label: string; ms: number }[] = [];
  const overallStart = Date.now();
  let error: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      let t = Date.now();
      const tenant = await tx.tenant.create({
        data: {
          name: "DIAG TEST — borrar",
          slug: `diag-test-${Date.now()}`,
          plan: "INDIVIDUAL",
          vertical: "GENERAL",
          status: "TRIAL",
        },
      });
      steps.push({ label: "tenant.create", ms: Date.now() - t });

      t = Date.now();
      const location = await tx.location.create({
        data: { tenantId: tenant.id, name: "Sede Principal", timezone: "America/Bogota" },
      });
      steps.push({ label: "location.create", ms: Date.now() - t });

      t = Date.now();
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: "Diag Test",
          email: `diag-test-${Date.now()}@example.com`,
          passwordHash: null,
        },
      });
      steps.push({ label: "user.create", ms: Date.now() - t });

      t = Date.now();
      await tx.staffLocationRole.create({
        data: { userId: user.id, locationId: location.id, role: "OWNER" },
      });
      steps.push({ label: "staffLocationRole.create", ms: Date.now() - t });

      t = Date.now();
      const service = await tx.service.create({
        data: { tenantId: tenant.id, name: "Consulta general", durationMinutes: 45, price: 50000 },
      });
      steps.push({ label: "service.create", ms: Date.now() - t });

      t = Date.now();
      const professional = await tx.professional.create({
        data: { tenantId: tenant.id, userId: user.id, name: "Diag Test", active: true },
      });
      steps.push({ label: "professional.create", ms: Date.now() - t });

      t = Date.now();
      await tx.professionalService.create({
        data: { professionalId: professional.id, serviceId: service.id },
      });
      steps.push({ label: "professionalService.create", ms: Date.now() - t });

      t = Date.now();
      await tx.professionalLocation.create({
        data: { professionalId: professional.id, locationId: location.id },
      });
      steps.push({ label: "professionalLocation.create", ms: Date.now() - t });

      t = Date.now();
      await tx.account.create({
        data: {
          userId: user.id,
          type: "oidc",
          provider: "google-diag",
          providerAccountId: `diag-${Date.now()}`,
        },
      });
      steps.push({ label: "account.create", ms: Date.now() - t });

      throw new RollbackMarker("rollback a propósito, no es un error real");
    });
  } catch (e) {
    if (!(e instanceof RollbackMarker)) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  }

  // Aparte: findUnique como el que hace el signIn callback / la
  // revalidación del jwt callback, para comparar contra el resto.
  const findStart = Date.now();
  let findError: string | null = null;
  try {
    await prisma.user.findUnique({ where: { email: "no-existe@example.com" } });
  } catch (e) {
    findError = e instanceof Error ? e.message : String(e);
  }
  const findMs = Date.now() - findStart;

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? "desconocida",
    totalMs: Date.now() - overallStart,
    transactionSteps: steps,
    transactionError: error,
    standaloneFindUnique: { ms: findMs, error: findError },
  });
}
