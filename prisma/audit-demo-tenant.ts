// Fase 0, tarea 0-1 del plan de ejecución: audita el tenant "consultorio-demo"
// (el que se usa como demo público para prospectos) en busca de datos de
// prueba filtrados — como la sede "Sede QA Fix Verificacion" encontrada en
// la auditoría del panel de especialistas — y los borra de forma segura.
//
// Por defecto corre en modo DRY-RUN: solo lista lo que encontró, no borra
// nada. Para borrar de verdad, correr con --apply.
//
// Uso:
//   npx tsx prisma/audit-demo-tenant.ts            (dry-run, solo reporta)
//   npx tsx prisma/audit-demo-tenant.ts --apply     (borra lo encontrado)
//
// Seguridad: antes de borrar una sede, chequea si tiene citas (Appointment)
// asociadas. Si tiene alguna, la salta y avisa en vez de borrarla — para no
// destruir una reserva real por accidente solo porque el nombre de la sede
// coincide con el patrón sospechoso.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_TENANT_SLUG = "consultorio-demo";
const SUSPICIOUS_PATTERN = /qa|test|prueba|fix|verificaci[oó]n/i;

const APPLY = process.argv.includes("--apply");

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: DEMO_TENANT_SLUG } });
  if (!tenant) {
    console.log(`No existe ningún tenant con slug "${DEMO_TENANT_SLUG}". Nada para auditar.`);
    return;
  }

  console.log(`Tenant demo: "${tenant.name}" (${tenant.id}), status=${tenant.status}, plan=${tenant.plan}\n`);

  const locations = await prisma.location.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Sedes encontradas (${locations.length}):`);
  for (const loc of locations) {
    const flagged = SUSPICIOUS_PATTERN.test(loc.name);
    console.log(`  ${flagged ? "⚠️ " : "   "}${loc.name}  (id=${loc.id}, creada=${loc.createdAt.toISOString()})`);
  }

  const flaggedLocations = locations.filter((l) => SUSPICIOUS_PATTERN.test(l.name));

  // Informativo: otras entidades del mismo tenant con nombres sospechosos,
  // para que las revises a mano — no se borran automáticamente porque no
  // sabemos con la misma certeza que son datos de prueba.
  const services = await prisma.service.findMany({ where: { tenantId: tenant.id } }).catch(() => []);
  const suspiciousServices = services.filter((s) => SUSPICIOUS_PATTERN.test(s.name));
  const professionals = await prisma.professional.findMany({ where: { tenantId: tenant.id } }).catch(() => []);
  const suspiciousProfessionals = professionals.filter((p) => SUSPICIOUS_PATTERN.test(p.name));

  if (suspiciousServices.length || suspiciousProfessionals.length) {
    console.log(`\nOtros nombres sospechosos en el mismo tenant (revisar a mano, no se tocan acá):`);
    suspiciousServices.forEach((s) => console.log(`  · Service: "${s.name}" (id=${s.id})`));
    suspiciousProfessionals.forEach((p) => console.log(`  · Professional: "${p.name}" (id=${p.id})`));
  }

  if (!flaggedLocations.length) {
    console.log(`\nNinguna sede coincide con el patrón sospechoso (${SUSPICIOUS_PATTERN}). Nada para borrar.`);
    return;
  }

  console.log(`\n${flaggedLocations.length} sede(s) marcada(s) para borrar:`);

  for (const loc of flaggedLocations) {
    const appointmentCount = await prisma.appointment.count({ where: { locationId: loc.id } });
    if (appointmentCount > 0) {
      console.log(
        `  ⚠️  SALTEADA "${loc.name}" (id=${loc.id}) — tiene ${appointmentCount} cita(s) real(es) asociada(s). Revisar a mano antes de borrar.`
      );
      continue;
    }

    if (!APPLY) {
      console.log(`  · "${loc.name}" (id=${loc.id}) — se borraría (sin citas asociadas). Corré con --apply para confirmar.`);
      continue;
    }

    await prisma.location.delete({ where: { id: loc.id } });
    console.log(`  ✅ Borrada "${loc.name}" (id=${loc.id})`);
  }

  if (!APPLY) {
    console.log(`\nEsto fue un dry-run — no se borró nada. Corré "npx tsx prisma/audit-demo-tenant.ts --apply" para aplicar.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
