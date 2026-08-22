// Fase 0, tarea 0-2: separación estructural entre el tenant de demo público
// (consultorio-demo, el que se le muestra a prospectos) y el lugar donde el
// equipo hace QA manual en el navegador.
//
// Antes de este script no existía ese segundo lugar — por eso una sesión de
// verificación en vivo terminó creando "Sede QA Fix Verificacion" directo
// sobre el tenant de demo (ver CLAUDE.md, sesión del 6 ago 2026, y el
// hallazgo del panel de especialistas). Este script crea un tenant
// "staging-verificacion" persistente, separado, con datos realistas para
// poder clickear — para que la regla de acá en adelante sea simple: QA
// manual en el navegador = este tenant. Nunca consultorio-demo.
//
// Idempotente: si el tenant ya existe, no hace nada (no es destructivo).
//
// Uso:
//   npx tsx prisma/seed-staging.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STAGING_SLUG = "staging-verificacion";
const STAGING_OWNER_EMAIL = "staging@rime-interno.local"; // dominio claramente no real, para que nunca se confunda con un cliente
const STAGING_OWNER_PASSWORD = "staging1234"; // mismo criterio de seguridad que DEMO_OWNER_PASSWORD en seed.ts — no es un tenant real

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: STAGING_SLUG } });
  if (existing) {
    console.log(`El tenant de staging ya existe (${existing.id}) — no se toca nada.`);
    console.log(`Login: ${STAGING_OWNER_EMAIL} / ${STAGING_OWNER_PASSWORD}`);
    return;
  }

  const ownerPasswordHash = await bcrypt.hash(STAGING_OWNER_PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name: "Staging Interno — Verificación",
      slug: STAGING_SLUG,
      plan: "PRO", // sin límites de plan, para no bloquear la verificación de ninguna feature por gating
      status: "ACTIVE",
      vertical: "GENERAL",
      marketplaceListed: false,
    },
  });

  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: "Sede de prueba",
      address: "Uso interno — no mostrar a clientes",
      timezone: "America/Bogota",
    },
  });

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: STAGING_OWNER_EMAIL,
      name: "Staging Interno",
      passwordHash: ownerPasswordHash,
      locationRoles: { create: { locationId: location.id, role: "OWNER" } },
    },
  });

  const professional = await prisma.professional.create({
    data: { tenantId: tenant.id, name: "Profesional de prueba", userId: owner.id },
  });

  const service = await prisma.service.create({
    data: {
      tenantId: tenant.id,
      name: "Servicio de prueba",
      durationMinutes: 30,
      price: 10000,
      professionals: { create: { professionalId: professional.id } },
    },
  });

  console.log(`Tenant de staging creado: ${tenant.id} (slug=${STAGING_SLUG})`);
  console.log(`Sede: ${location.name} | Profesional: ${professional.name} | Servicio: ${service.name}`);
  console.log(`\nLogin: ${STAGING_OWNER_EMAIL} / ${STAGING_OWNER_PASSWORD}`);
  console.log(`\nA partir de ahora: cualquier verificación manual en el navegador va acá, nunca en consultorio-demo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
