// Verifica, contra los datos reales sembrados por qa-portabilidad-racha.ts:
//   (a) computeWeeklySessionStreak sobre las citas reales del cliente,
//   (b) el mismo armado de payload que hace el route handler de export
//       (mismas queries y helpers — getEffectiveClientFieldTemplate,
//       APPOINTMENT_STATUS_LABELS —, sin pasar por auth() porque este
//       entorno no tiene navegador/sesión HTTP real disponible; ver la nota
//       en CLAUDE.md sobre qué queda cubierto así vs. por una sesión real).
//
// Uso: npx tsx prisma/qa-portabilidad-racha-verify.ts

import { PrismaClient } from "@prisma/client";
import { computeWeeklySessionStreak } from "../src/lib/streak";
import { getEffectiveClientFieldTemplate } from "../src/lib/clientFieldTemplates";
import { APPOINTMENT_STATUS_LABELS } from "../src/lib/appointmentStatus";

const prisma = new PrismaClient();

const SLUG = "qa-portabilidad-racha";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.log(`No existe el tenant "${SLUG}". Corré primero "npx tsx prisma/qa-portabilidad-racha.ts".`);
    process.exit(1);
  }

  const client = await prisma.client.findFirstOrThrow({ where: { tenantId: tenant.id } });

  const appointments = await prisma.appointment.findMany({
    where: { clientId: client.id, tenantId: tenant.id },
    include: { service: true, professional: true },
    orderBy: { startsAt: "desc" },
  });

  console.log("--- (a) Racha de constancia ---");
  const completedDates = appointments.filter((a) => a.status === "COMPLETED").map((a) => a.startsAt);
  const streak = computeWeeklySessionStreak(completedDates, new Date());
  console.log(`Racha calculada: ${streak} (esperado: 3 — semanas 0,1,2 consecutivas, semana 5 no cuenta)`);

  console.log("\n--- (b) Payload de exportación (misma lógica que el route handler) ---");
  const fieldTemplate = await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical);
  const customFieldsRaw = (client.customFields ?? {}) as Record<string, unknown>;
  const customFieldsLabeled = Object.fromEntries(
    fieldTemplate.filter((f) => f.key in customFieldsRaw).map((f) => [f.label, customFieldsRaw[f.key]])
  );
  const packages = await prisma.sessionPackage.findMany({
    where: { clientId: client.id, tenantId: tenant.id },
    include: { service: true },
  });

  const exportPayload = {
    cliente: { nombre: client.name, ficha: customFieldsLabeled },
    historialDeCitas: appointments.map((a) => ({
      servicio: a.service.name,
      fecha: a.startsAt,
      estado: APPOINTMENT_STATUS_LABELS[a.status],
    })),
    paquetesDeSesiones: packages.map((p) => ({
      sesionesUsadas: p.usedSessions,
      sesionesTotales: p.totalSessions,
      estado: p.status,
    })),
  };
  console.log(JSON.stringify(exportPayload, null, 2));

  const expectedFicha = ["Estilo preferido", "Máquina / milímetro habitual", "Productos preferidos"];
  const gotFicha = Object.keys(customFieldsLabeled);
  console.log(
    `\nFicha con etiquetas legibles (no keys camelCase): ${JSON.stringify(gotFicha)} ` +
      `(esperado, en algún orden: ${JSON.stringify(expectedFicha)})`
  );

  console.log("\nListo. Limpiá todo con: npx tsx prisma/qa-portabilidad-racha-cleanup.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
