import { PrismaClient } from "@prisma/client";
import type { Plan } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Contraseña de demo, igual que prisma/seed.ts.
const DEMO_OWNER_PASSWORD = "demo1234";

// Tenants mínimos, uno por cada plan que el seed principal no cubre (ese
// solo crea un tenant PREMIUM) — para poder probar de verdad el gating de
// módulos y los topes de sede/profesional de cada plan. upsert por slug:
// re-ejecutable sin duplicar, a diferencia de prisma/seed.ts.
const PLAN_TENANTS: { slug: string; name: string; plan: Plan; email: string }[] = [
  { slug: "test-individual", name: "Tenant Prueba Individual", plan: "INDIVIDUAL", email: "owner@test-individual.com" },
  { slug: "test-basico", name: "Tenant Prueba Básico", plan: "BASICO", email: "owner@test-basico.com" },
  { slug: "test-pro", name: "Tenant Prueba Pro", plan: "PRO", email: "owner@test-pro.com" },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_OWNER_PASSWORD, 10);

  for (const t of PLAN_TENANTS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: t.slug },
      update: { plan: t.plan },
      create: {
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        status: "TRIAL",
      },
    });

    // Location no tiene una clave única propia para upsert directo — se
    // busca primero y solo se crea si el tenant todavía no tiene ninguna.
    const location =
      (await prisma.location.findFirst({ where: { tenantId: tenant.id } })) ??
      (await prisma.location.create({
        data: {
          tenantId: tenant.id,
          name: "Sede Principal",
          address: "Sede de prueba",
          timezone: "America/Bogota",
        },
      }));

    await prisma.user.upsert({
      where: { email: t.email },
      update: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        email: t.email,
        name: `Owner ${t.plan}`,
        passwordHash,
        locationRoles: {
          create: { locationId: location.id, role: "OWNER" },
        },
      },
    });

    console.log(`Listo: ${t.slug} (${t.plan}) — ${t.email} / ${DEMO_OWNER_PASSWORD}`);
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
