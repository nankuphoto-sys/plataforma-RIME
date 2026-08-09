// Script de QA descartable — arma un tenant PREMIUM (vertical ESTETICA) con
// un cliente y una foto de seguimiento sembrada DIRECTO en la base (con una
// URL falsa, sin pasar por Vercel Blob real — este entorno no tiene
// BLOB_READ_WRITE_TOKEN configurado, así que uploadClientPhotoAction en sí
// NO se puede probar de punta a punta en esta sesión). Confirma el modelo
// ClientPhoto, el scoping por tenant+cliente, y el gating por plan.
//
// Uso:
//   npx tsx prisma/qa-client-photos.ts
//   npx tsx prisma/qa-client-photos-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { planIncludesModule } from "../src/lib/planLimits";

const prisma = new PrismaClient();

const SLUG = "qa-client-photos";
const OWNER_EMAIL = "owner-client-photos-qa@qa.test";
const PASSWORD = "QaClientPhotos123!";

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(`Ya existe un tenant con slug "${SLUG}". Corré primero "npx tsx prisma/qa-client-photos-cleanup.ts".`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: { name: "QA Fotos", slug: SLUG, plan: "PREMIUM", status: "ACTIVE", vertical: "ESTETICA" },
  });

  const location = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede QA", timezone: "America/Bogota" },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      name: "Owner QA",
      passwordHash,
      locationRoles: { create: [{ locationId: location.id, role: "OWNER" }] },
    },
  });

  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente QA Fotos", phone: "+573000000055" },
  });

  // URL de ejemplo — NO es una subida real a Vercel Blob, solo para probar
  // que el modelo y el scoping funcionan.
  const photo = await prisma.clientPhoto.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      url: "https://example-blob.public.blob.vercel-storage.com/client-photos/fake-abc123.jpg",
      caption: "Antes del tratamiento — sesión 1",
    },
  });

  console.log("--- Gating por plan ---");
  console.log(`planIncludesModule(PREMIUM, "photos") = ${planIncludesModule("PREMIUM", "photos")} (esperado: true)`);
  console.log(`planIncludesModule(INDIVIDUAL, "photos") = ${planIncludesModule("INDIVIDUAL", "photos")} (esperado: false)`);
  console.log(`planIncludesModule(BASICO, "photos") = ${planIncludesModule("BASICO", "photos")} (esperado: false)`);

  console.log("\n--- Scoping (misma query que usa la página) ---");
  const found = await prisma.clientPhoto.findMany({ where: { clientId: client.id, tenantId: tenant.id } });
  console.log(`Fotos encontradas: ${found.length} (esperado: 1)`);
  console.log(`Caption: "${found[0]?.caption}"`);

  const wrongTenant = await prisma.clientPhoto.findMany({
    where: { clientId: client.id, tenantId: "tenant-que-no-existe" },
  });
  console.log(`Con tenantId incorrecto: ${wrongTenant.length} (esperado: 0)`);

  console.log(`\nFoto sembrada: ${photo.id}`);
  console.log("\nListo. Limpiá todo con: npx tsx prisma/qa-client-photos-cleanup.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
