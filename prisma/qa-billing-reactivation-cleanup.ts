// Borra los dos tenants descartables creados por
// prisma/qa-billing-reactivation.ts. Cascade sobre todo lo que cuelga de
// ellos.
//
// Uso:
//   npx tsx prisma/qa-billing-reactivation-cleanup.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUGS = ["qa-billing-stripe", "qa-billing-wompi"];

async function main() {
  for (const slug of SLUGS) {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      console.log(`No hay ningún tenant con slug "${slug}" — nada para borrar.`);
      continue;
    }
    await prisma.tenant.delete({ where: { id: tenant.id } });
    console.log(`Tenant "${slug}" (${tenant.id}) borrado, cascade incluido.`);
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
