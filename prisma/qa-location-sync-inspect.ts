// Complemento de prisma/qa-location-sync.ts — imprime el estado actual de
// ProfessionalLocation y StaffLocationRole del tenant QA, para confirmar a
// nivel de base de datos lo que la UI no puede mostrar directamente (en
// particular, el caso "profesional sin usuario vinculado: cambiar su
// checklist de sedes NUNCA debe crear ningún StaffLocationRole").
//
// Uso (correr las veces que haga falta, antes/después de cada paso del
// checklist de verificación):
//   npx tsx prisma/qa-location-sync-inspect.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_SLUG = "qa-resync-sedes";

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    include: {
      locations: true,
      professionals: { include: { professionalLocations: { include: { location: true } }, user: true } },
    },
  });
  if (!tenant) {
    console.log(`No hay ningún tenant con slug "${TENANT_SLUG}" — ¿corriste qa-location-sync.ts?`);
    return;
  }

  const roles = await prisma.staffLocationRole.findMany({
    where: { location: { tenantId: tenant.id } },
    include: { user: true, location: true },
  });

  console.log(`\n=== ProfessionalLocation (checklist de sedes asignadas) ===`);
  for (const professional of tenant.professionals) {
    const sedes = professional.professionalLocations.map((pl) => pl.location.name).join(", ") || "(ninguna)";
    const linked = professional.user ? professional.user.email : "(sin usuario vinculado)";
    console.log(`- ${professional.name} [${linked}]: ${sedes}`);
  }

  console.log(`\n=== StaffLocationRole (acceso real al dashboard, por sede) ===`);
  for (const location of tenant.locations) {
    const rolesHere = roles.filter((r) => r.locationId === location.id);
    console.log(`- ${location.name}:`);
    if (rolesHere.length === 0) console.log(`    (sin nadie con acceso)`);
    for (const role of rolesHere) {
      console.log(`    ${role.user.email} -> ${role.role}`);
    }
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
