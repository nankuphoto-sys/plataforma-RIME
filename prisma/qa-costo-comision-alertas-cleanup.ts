// Borra el tenant descartable creado por prisma/qa-costo-comision-alertas.ts.
// Cascade sobre todo lo que cuelga de él.
//
// Uso:
//   npx tsx prisma/qa-costo-comision-alertas-cleanup.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "qa-costo-comision";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.log(`No hay ningún tenant con slug "${SLUG}" — nada para borrar.`);
    return;
  }
  await prisma.tenant.delete({ where: { id: tenant.id } });
  console.log(`Tenant "${SLUG}" (${tenant.id}) borrado, cascade incluido.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
