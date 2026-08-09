// Borra el tenant descartable creado por prisma/qa-professional-scope.ts.
// El delete de Tenant hace cascade sobre todo lo que cuelga de él
// (Location, User, Professional, Client, Service, Appointment,
// StaffLocationRole, ProfessionalLocation) — no queda nada huérfano.
//
// Uso:
//   npx tsx prisma/qa-professional-scope-cleanup.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_SLUG = "qa-solo-lo-mio";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    console.log(`No hay ningún tenant con slug "${TENANT_SLUG}" — nada para borrar.`);
    return;
  }

  await prisma.tenant.delete({ where: { id: tenant.id } });
  console.log(`Tenant "${TENANT_SLUG}" (${tenant.id}) borrado, cascade incluido.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
