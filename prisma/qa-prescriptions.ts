// Script de QA descartable — arma un tenant PSICOLOGIA con un cliente y un
// profesional, y crea una receta con contenido real (tildes, ñ, múltiples
// líneas) para confirmar que el modelo Prescription persiste y se puede
// consultar correctamente scoped por tenant+cliente.
//
// Uso:
//   npx tsx prisma/qa-prescriptions.ts
//   npx tsx prisma/qa-prescriptions-verify.ts
//   npx tsx prisma/qa-prescriptions-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG = "qa-prescriptions";
const OWNER_EMAIL = "owner-prescriptions-qa@qa.test";
const PASSWORD = "QaPrescriptions123!";

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(`Ya existe un tenant con slug "${SLUG}". Corré primero "npx tsx prisma/qa-prescriptions-cleanup.ts".`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Plan INDIVIDUAL a propósito: prescriptions debe funcionar igual acá que
  // en PREMIUM, a diferencia de Paquetes/Lista de espera.
  const tenant = await prisma.tenant.create({
    data: { name: "QA Recetas", slug: SLUG, plan: "INDIVIDUAL", status: "ACTIVE", vertical: "PSICOLOGIA" },
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

  const professional = await prisma.professional.create({
    data: { tenantId: tenant.id, name: "Dra. María José Peña", active: true },
  });

  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente QA Recetas", phone: "+573000000077" },
  });

  const prescription = await prisma.prescription.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      professionalId: professional.id,
      title: "Plan de tratamiento — sesión inicial",
      content:
        "Diagnóstico: episodio de ansiedad generalizada.\n" +
        "Indicaciones: técnicas de respiración diafragmática 2 veces al día.\n" +
        "Próximo control en 2 semanas.",
    },
  });

  console.log(`
QA listo — tenant "QA Recetas" (${SLUG}), plan INDIVIDUAL, vertical PSICOLOGIA.
URL cliente: /dashboard/${SLUG}/clients/${client.id}
Receta sembrada: ${prescription.id}

Siguiente paso: npx tsx prisma/qa-prescriptions-verify.ts
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
