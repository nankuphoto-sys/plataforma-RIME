// Borra todo lo sembrado por qa-client-photos.ts (cascade sobre Location/
// User/StaffLocationRole/Client/ClientPhoto). No borra nada de Vercel Blob
// (la URL sembrada es falsa, nunca se subió nada real).
//
// Uso: npx tsx prisma/qa-client-photos-cleanup.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "qa-client-photos";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.log(`No existe ningún tenant con slug "${SLUG}" — nada que borrar.`);
    return;
  }
  await prisma.tenant.delete({ where: { id: tenant.id } });
  console.log(`Tenant "${SLUG}" (${tenant.id}) borrado, junto con todos sus datos relacionados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
