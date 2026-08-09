// Script de QA descartable — verifica en vivo la "resincronización automática
// de accesos al cambiar sedes" (StaffLocationRole vs. ProfessionalLocation,
// ver src/lib/professionalLocationSync.ts). Correr en tu máquina real (el
// sandbox de Cowork no tiene acceso de red a la base de datos).
//
// Uso:
//   npx tsx prisma/qa-location-sync.ts
//
// Limpieza al terminar:
//   npx tsx prisma/qa-location-sync-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TENANT_SLUG = "qa-resync-sedes";
const PASSWORD = "QaResyncSedes123!";

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (existing) {
    console.log(
      `Ya existe un tenant con slug "${TENANT_SLUG}" (id ${existing.id}). Corré primero ` +
        `"npx tsx prisma/qa-location-sync-cleanup.ts" y volvé a correr este script.`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Resync Sedes",
      slug: TENANT_SLUG,
      plan: "PREMIUM",
      status: "TRIAL",
      vertical: "GENERAL",
    },
  });

  const sedeX = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede X (QA)", timezone: "America/Santiago" },
  });
  const sedeY = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede Y (QA)", timezone: "America/Santiago" },
  });

  // OWNER, solo en Sede X — alcanza para gestionar Profesionales/Sedes en
  // todo el tenant (los guards de esas páginas piden el rol en CUALQUIER
  // sede del tenant, no en cada sede puntual).
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner-resync-qa@qa.test",
      name: "Owner Resync QA",
      passwordHash,
      locationRoles: { create: { locationId: sedeX.id, role: "OWNER" } },
    },
  });

  // Caso (4): el OWNER vinculado a sí mismo como su propio profesional,
  // asignado a Sede X — al desasignarlo como profesional de Sede X, su rol
  // OWNER ahí debe quedar intacto.
  await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      name: "Dueño (QA)",
      userId: owner.id,
      professionalLocations: { create: { locationId: sedeX.id } },
    },
  });

  // Casos (1)/(2)/(3): profesional CON usuario vinculado, asignado solo a
  // Sede X al arrancar.
  const syncUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "profesional-sync-qa@qa.test",
      name: "Profesional Sync (QA)",
      passwordHash,
      locationRoles: { create: { locationId: sedeX.id, role: "PROFESSIONAL" } },
    },
  });
  const syncProfessional = await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      name: "Profesional Sync (QA)",
      userId: syncUser.id,
      professionalLocations: { create: { locationId: sedeX.id } },
    },
  });

  // Caso (5): profesional SIN usuario vinculado, asignado a Sede X al
  // arrancar — cambiar su checklist de sedes no debe crear ningún
  // StaffLocationRole (no hay usuario al cual otorgárselo).
  const noLoginProfessional = await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      name: "Profesional Sin Login (QA)",
      professionalLocations: { create: { locationId: sedeX.id } },
    },
  });

  console.log(`
QA listo — tenant "${tenant.name}" (${TENANT_SLUG}).

Login OWNER (gestiona Profesionales y Sedes):
  email:    ${owner.email}
  password: ${PASSWORD}

Login Profesional Sync (empieza asignado SOLO a Sede X):
  email:    ${syncUser.email}
  password: ${PASSWORD}
  professionalId: ${syncProfessional.id}

Profesional Sin Login (sin usuario vinculado, empieza asignado a Sede X):
  professionalId: ${noLoginProfessional.id}
  (no tiene login — su verificación es que NUNCA aparezca ningún
  StaffLocationRole para él, se confirma por ausencia, no por UI)

Sede X (QA): ${sedeX.id}
Sede Y (QA): ${sedeY.id}

URL del dashboard: /dashboard/${TENANT_SLUG}

Cuando termines de verificar, limpiá todo con:
  npx tsx prisma/qa-location-sync-cleanup.ts
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
