// Ejercita, contra los datos reales sembrados por qa-paquetes.ts:
//   (a) el cron detect-expiring-packages (llamado directamente como función,
//       mismo código que correría en producción) — confirma que encola
//       exactamente el paquete "nearingExpiration" y nada más;
//   (b) una segunda corrida del mismo cron — confirma que no duplica (dedup
//       por packageId);
//   (c) la lógica de redención (mismas operaciones de Prisma que
//       redeemPackageSessionAction) sobre "nearingExpiration": redimir su
//       única sesión disponible debe dejarlo en usedSessions=3/3 y
//       status=COMPLETED.
//
// Deliberadamente NO se corre send-package-expiration-alerts: el teléfono
// sembrado es de prueba pero WHATSAPP_CLOUD_API_TOKEN sí es una credencial
// real de Meta, y la plantilla "alerta_paquete_vencimiento" no existe/no está
// aprobada todavía — correrlo dispararía un intento real contra la API de
// Meta sin necesidad (mismo criterio ya documentado en CLAUDE.md para
// alerta_stock_bajo).
//
// Uso: npx tsx prisma/qa-paquetes-verify.ts

import { PrismaClient } from "@prisma/client";
import { canRedeemSession } from "../src/lib/packages";
import { GET as detectExpiringPackages } from "../src/app/api/cron/detect-expiring-packages/route";

const prisma = new PrismaClient();

const SLUG = "qa-paquetes";

function cronRequest(): Request {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET no está configurado en .env — no se puede probar el cron.");
  return new Request("http://localhost:3000/api/cron/detect-expiring-packages", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.log(`No existe el tenant "${SLUG}". Corré primero "npx tsx prisma/qa-paquetes.ts".`);
    process.exit(1);
  }

  const packagesBefore = await prisma.sessionPackage.findMany({
    where: { tenantId: tenant.id },
    orderBy: { totalSessions: "asc" },
  });
  console.log("--- Paquetes sembrados ---");
  for (const pkg of packagesBefore) {
    console.log(
      `${pkg.id}: ${pkg.usedSessions}/${pkg.totalSessions} usadas, vence ${pkg.expiresAt?.toISOString() ?? "nunca"}`
    );
  }

  console.log("\n--- (a) Primera corrida de detect-expiring-packages ---");
  const firstRun = await (await detectExpiringPackages(cronRequest())).json();
  console.log(firstRun);

  const queuedAfterFirst = await prisma.notificationQueue.findMany({
    where: { tenantId: tenant.id, kind: "PACKAGE_EXPIRATION" },
  });
  console.log(`Filas en NotificationQueue (kind=PACKAGE_EXPIRATION): ${queuedAfterFirst.length}`);
  for (const row of queuedAfterFirst) {
    console.log(`  packageId=${row.packageId} status=${row.status} payload=${JSON.stringify(row.payload)}`);
  }

  console.log("\n--- (b) Segunda corrida (debe dar enqueued: 0, no duplicar) ---");
  const secondRun = await (await detectExpiringPackages(cronRequest())).json();
  console.log(secondRun);

  const queuedAfterSecond = await prisma.notificationQueue.count({
    where: { tenantId: tenant.id, kind: "PACKAGE_EXPIRATION" },
  });
  console.log(`Filas en NotificationQueue después de la 2da corrida: ${queuedAfterSecond}`);

  console.log("\n--- (c) Lógica de redención sobre 'nearingExpiration' ---");
  const nearingExpiration = packagesBefore.find((p) => p.totalSessions === 3)!;
  const canRedeemBefore = canRedeemSession(nearingExpiration);
  console.log(`canRedeemSession antes (2/3 usadas): ${canRedeemBefore} (esperado: true)`);

  const nextUsedSessions = nearingExpiration.usedSessions + 1;
  const nextStatus = nextUsedSessions >= nearingExpiration.totalSessions ? "COMPLETED" : nearingExpiration.status;
  const [updatedPackage] = await prisma.$transaction([
    prisma.sessionPackage.update({
      where: { id: nearingExpiration.id },
      data: { usedSessions: nextUsedSessions, status: nextStatus },
    }),
    prisma.packageRedemption.create({
      data: { packageId: nearingExpiration.id, appointmentId: null },
    }),
  ]);
  console.log(
    `Después de redimir: ${updatedPackage.usedSessions}/${updatedPackage.totalSessions}, status=${updatedPackage.status} (esperado: 3/3, COMPLETED)`
  );

  const canRedeemAfter = canRedeemSession(updatedPackage);
  console.log(`canRedeemSession después (ya completo): ${canRedeemAfter} (esperado: false)`);

  const fullyUsed = packagesBefore.find((p) => p.totalSessions === 5)!;
  console.log(
    `canRedeemSession sobre 'fullyUsed' (5/5 desde el inicio): ${canRedeemSession(fullyUsed)} (esperado: false)`
  );

  console.log("\nListo. Limpiá todo con: npx tsx prisma/qa-paquetes-cleanup.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
