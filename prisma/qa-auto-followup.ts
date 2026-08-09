// Script de QA descartable — arma un tenant PSICOLOGIA con 3 citas CONFIRMED
// listas para completar, cada una pensada para un escenario distinto del
// auto-agendado de seguimiento:
//   1. "Cita libre": nada choca 14 días después -> DEBE crear el seguimiento.
//   2. "Cita ocupada": ya existe otra cita del MISMO profesional exactamente
//      en el horario candidato (14 días después, mismo horario) -> NO debe
//      crear nada (nunca fuerza un doble-booking ni elige otro horario).
//   3. Un tenant SEPARADO en vertical ESTETICA con una cita idéntica a la
//      "libre" -> NO debe crear nada porque la vertical no es de salud.
//
// Uso:
//   npx tsx prisma/qa-auto-followup.ts
//   npx tsx prisma/qa-auto-followup-verify.ts
//   npx tsx prisma/qa-auto-followup-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG_HEALTH = "qa-autofollowup-salud";
const SLUG_NONHEALTH = "qa-autofollowup-estetica";
const PASSWORD = "QaAutoFollowup123!";

async function buildTenant(slug: string, vertical: "PSICOLOGIA" | "ESTETICA") {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const tenant = await prisma.tenant.create({
    data: { name: `QA Auto-followup (${vertical})`, slug, plan: "PREMIUM", status: "ACTIVE", vertical },
  });
  const location = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede QA", timezone: "America/Bogota" },
  });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `owner-${slug}@qa.test`,
      name: "Owner QA",
      passwordHash,
      locationRoles: { create: [{ locationId: location.id, role: "OWNER" }] },
    },
  });
  const service = await prisma.service.create({
    data: { tenantId: tenant.id, name: "Sesión QA", durationMinutes: 50, price: 60, active: true },
  });
  const professional = await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      name: "Profesional QA",
      active: true,
      services: { create: [{ serviceId: service.id }] },
      professionalLocations: { create: [{ locationId: location.id }] },
    },
  });
  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente QA", phone: "+573000000066" },
  });
  return { tenant, location, service, professional, client };
}

async function main() {
  if (await prisma.tenant.findUnique({ where: { slug: SLUG_HEALTH } })) {
    console.log(`Ya existe un tenant con slug "${SLUG_HEALTH}". Corré primero "npx tsx prisma/qa-auto-followup-cleanup.ts".`);
    process.exit(1);
  }

  const health = await buildTenant(SLUG_HEALTH, "PSICOLOGIA");
  const nonHealth = await buildTenant(SLUG_NONHEALTH, "ESTETICA");

  const FOLLOW_UP_INTERVAL_DAYS = 14;
  const baseStartsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // mañana
  const endsAt = new Date(baseStartsAt.getTime() + 50 * 60_000);

  // 1. Cita "libre" en el tenant de salud.
  const freeAppointment = await prisma.appointment.create({
    data: {
      tenantId: health.tenant.id,
      locationId: health.location.id,
      professionalId: health.professional.id,
      serviceId: health.service.id,
      clientId: health.client.id,
      startsAt: baseStartsAt,
      endsAt,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });

  // 2. Cita "ocupada": otro cliente, MISMO profesional, ya reservado
  // exactamente en el horario que el auto-agendado de la cita 3 intentaría usar.
  const occupiedBaseStartsAt = new Date(baseStartsAt.getTime() + 24 * 60 * 60 * 1000); // pasado mañana
  const conflictingClient = await prisma.client.create({
    data: { tenantId: health.tenant.id, name: "Cliente QA (choque)", phone: "+573000000067" },
  });
  const blockerStartsAt = new Date(occupiedBaseStartsAt.getTime() + FOLLOW_UP_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.appointment.create({
    data: {
      tenantId: health.tenant.id,
      locationId: health.location.id,
      professionalId: health.professional.id,
      serviceId: health.service.id,
      clientId: conflictingClient.id,
      startsAt: blockerStartsAt,
      endsAt: new Date(blockerStartsAt.getTime() + 50 * 60_000),
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });
  const occupiedAppointment = await prisma.appointment.create({
    data: {
      tenantId: health.tenant.id,
      locationId: health.location.id,
      professionalId: health.professional.id,
      serviceId: health.service.id,
      clientId: health.client.id,
      startsAt: occupiedBaseStartsAt,
      endsAt: new Date(occupiedBaseStartsAt.getTime() + 50 * 60_000),
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });

  // 3. Cita idéntica a la "libre" pero en el tenant ESTETICA.
  const nonHealthAppointment = await prisma.appointment.create({
    data: {
      tenantId: nonHealth.tenant.id,
      locationId: nonHealth.location.id,
      professionalId: nonHealth.professional.id,
      serviceId: nonHealth.service.id,
      clientId: nonHealth.client.id,
      startsAt: baseStartsAt,
      endsAt,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });

  console.log(`
QA listo.

Tenant salud "${SLUG_HEALTH}":
  - freeAppointment (${freeAppointment.id}): al completarla, DEBE crear un seguimiento 14 días después.
  - occupiedAppointment (${occupiedAppointment.id}): al completarla, NO debe crear nada (el profesional ya tiene otra cita en ese horario exacto).

Tenant NO-salud "${SLUG_NONHEALTH}" (vertical ESTETICA):
  - nonHealthAppointment (${nonHealthAppointment.id}): al completarla, NO debe crear nada (vertical no elegible).

Siguiente paso: npx tsx prisma/qa-auto-followup-verify.ts
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
