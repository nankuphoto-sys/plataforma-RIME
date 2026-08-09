// Script de QA descartable — crea un tenant YA configurado con Wompi
// (wompiPaymentSourceId sembrado directo, sin pasar por la tokenización real
// del widget) para verificar en vivo el cambio de plan self-service
// (changeWompiSubscriptionPlanAction, ver CLAUDE.md sección "Cambio de plan
// self-service para tenants en Wompi").
//
// Por qué sembrar en vez de tokenizar de verdad: changeWompiSubscriptionPlanAction
// NUNCA llama a la API de Wompi — solo chequea que `wompiPaymentSourceId` no
// sea null (para saber que hay "una suscripción de Wompi configurada") y
// después actualiza `Tenant.plan` directamente. No hay nada del lado de
// Wompi que este flujo pueda romper con un source_id falso, así que sembrarlo
// no es un atajo que salte ninguna verificación real.
//
// El tenant arranca en plan BASICO con DOS sedes ya creadas — a propósito,
// para poder probar en vivo el aviso de "estás por encima del límite del
// plan nuevo" al bajar a INDIVIDUAL (que solo permite 1 sede).
//
// Uso:
//   npx tsx prisma/qa-wompi-change-plan.ts
//
// Al terminar de verificar, borrar todo con:
//   npx tsx prisma/qa-wompi-change-plan-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG = "qa-wompi-plan-change";
const OWNER_EMAIL = "owner-wompi-plan-qa@qa.test";
const PASSWORD = "QaWompiPlan123!";

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(
      `Ya existe un tenant con slug "${SLUG}" (id ${existing.id}). Corré primero ` +
        `"npx tsx prisma/qa-wompi-change-plan-cleanup.ts" y volvé a correr este script.`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const nextChargeAt = new Date();
  nextChargeAt.setDate(nextChargeAt.getDate() + 30);

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Wompi Change Plan",
      slug: SLUG,
      plan: "BASICO",
      status: "ACTIVE",
      vertical: "GENERAL",
      wompiPaymentSourceId: `qa_fake_source_${Date.now()}`,
      wompiCardLastFour: "4242",
      wompiNextChargeAt: nextChargeAt,
    },
  });

  const sedeUno = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede QA 1", timezone: "America/Bogota" },
  });
  const sedeDos = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede QA 2", timezone: "America/Bogota" },
  });

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      name: "Owner QA",
      passwordHash,
      locationRoles: {
        create: [
          { locationId: sedeUno.id, role: "OWNER" },
          { locationId: sedeDos.id, role: "OWNER" },
        ],
      },
    },
  });

  console.log(`
QA listo — tenant "QA Wompi Change Plan" (${SLUG}), plan BASICO, status ACTIVE,
con Wompi ya "configurado" (wompiPaymentSourceId sembrado) y 2 sedes.

Login OWNER:
  email:    ${owner.email}
  password: ${PASSWORD}
URL: /dashboard/${SLUG}/billing

Cuando termines de verificar, limpiá todo con:
  npx tsx prisma/qa-wompi-change-plan-cleanup.ts
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
