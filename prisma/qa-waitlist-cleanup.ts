// Borra todo lo sembrado por qa-waitlist.ts (cascade sobre Location/User/
// StaffLocationRole/Service/Professional/Client/Appointment/WaitlistEntry).
//
// Uso: npx tsx prisma/qa-waitlist-cleanup.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "qa-waitlist";

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
