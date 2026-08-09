// Borra el tenant descartable creado por prisma/qa-location-sync.ts.
// Cascade sobre todo lo que cuelga de él.
//
// Uso:
//   npx tsx prisma/qa-location-sync-cleanup.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_SLUG = "qa-resync-sedes";

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
