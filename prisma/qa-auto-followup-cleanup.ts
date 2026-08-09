// Borra ambos tenants sembrados por qa-auto-followup.ts (cascade sobre
// Location/User/StaffLocationRole/Service/Professional/Client/Appointment).
//
// Uso: npx tsx prisma/qa-auto-followup-cleanup.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUGS = ["qa-autofollowup-salud", "qa-autofollowup-estetica"];

async function main() {
  for (const slug of SLUGS) {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      console.log(`No existe ningún tenant con slug "${slug}" — nada que borrar.`);
      continue;
    }
    await prisma.tenant.delete({ where: { id: tenant.id } });
    console.log(`Tenant "${slug}" (${tenant.id}) borrado, junto con todos sus datos relacionados.`);
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
