// Script de QA descartable — crea un tenant nuevo, autocontenido, para
// verificar en vivo la reactivación de cuenta tras CANCELLED (Stripe y
// Wompi, ver CLAUDE.md sección "Reactivación de cuenta tras CANCELLED").
// Pensado para correr en tu máquina real (el sandbox de Cowork no tiene
// acceso de red a la base de datos ni puede generar el engine de Prisma
// para Linux).
//
// Crea DOS tenants — uno para probar el flujo de Stripe y otro para Wompi,
// porque un tenant no puede tener ambos proveedores configurados a la vez
// (exclusión mutua ya existente en el proyecto).
//
// Uso:
//   npx tsx prisma/qa-billing-reactivation.ts
//
// Al terminar de verificar, borrar todo con:
//   npx tsx prisma/qa-billing-reactivation-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "QaBillingReact123!";

async function createTenant(slug: string, name: string, ownerEmail: string) {
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    console.log(
      `Ya existe un tenant con slug "${slug}" (id ${existing.id}). Corré primero ` +
        `"npx tsx prisma/qa-billing-reactivation-cleanup.ts" y volvé a correr este script.`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: { name, slug, plan: "INDIVIDUAL", status: "TRIAL", vertical: "GENERAL" },
  });

  const location = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede QA", timezone: "America/Santiago" },
  });

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: ownerEmail,
      name: "Owner QA",
      passwordHash,
      locationRoles: { create: { locationId: location.id, role: "OWNER" } },
    },
  });

  return { tenant, owner };
}

async function main() {
  const stripeTenant = await createTenant(
    "qa-billing-stripe",
    "QA Billing Stripe",
    "owner-billing-stripe-qa@qa.test"
  );
  const wompiTenant = await createTenant(
    "qa-billing-wompi",
    "QA Billing Wompi",
    "owner-billing-wompi-qa@qa.test"
  );

  console.log(`
QA listo — dos tenants para probar reactivación de cuenta.

=== Tenant Stripe ===
slug: ${stripeTenant.tenant.slug}
Login OWNER:
  email:    ${stripeTenant.owner.email}
  password: ${PASSWORD}
URL: /dashboard/${stripeTenant.tenant.slug}/billing

=== Tenant Wompi ===
slug: ${wompiTenant.tenant.slug}
Login OWNER:
  email:    ${wompiTenant.owner.email}
  password: ${PASSWORD}
URL: /dashboard/${wompiTenant.tenant.slug}/billing

Cuando termines de verificar, limpiá todo con:
  npx tsx prisma/qa-billing-reactivation-cleanup.ts
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
