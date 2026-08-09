// Script de QA descartable — arma un tenant PREMIUM con 2 clientes en lista
// de espera del mismo servicio/sede (uno sin preferencia de profesional, uno
// que pide específicamente OTRO profesional distinto al de la cita que se va
// a cancelar) más una cita CONFIRMED de un tercer cliente, para verificar en
// vivo que al "cancelarla" (misma lógica que updateAppointmentStatusAction,
// replicada acá porque esa Server Action depende de auth() y este entorno no
// tiene sesión HTTP real) se le ofrece el cupo al candidato correcto y se
// ignora al que pidió otro profesional.
//
// Uso:
//   npx tsx prisma/qa-waitlist.ts
//   npx tsx prisma/qa-waitlist-verify.ts
//   npx tsx prisma/qa-waitlist-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG = "qa-waitlist";
const OWNER_EMAIL = "owner-waitlist-qa@qa.test";
const PASSWORD = "QaWaitlist123!";

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(`Ya existe un tenant con slug "${SLUG}". Corré primero "npx tsx prisma/qa-waitlist-cleanup.ts".`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: { name: "QA Waitlist", slug: SLUG, plan: "PREMIUM", status: "ACTIVE", vertical: "ESTETICA" },
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

  const service = await prisma.service.create({
    data: { tenantId: tenant.id, name: "Masaje QA", durationMinutes: 60, price: 50, active: true },
  });

  const professionalA = await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      name: "Profesional A (dueño de la cita)",
      active: true,
      services: { create: [{ serviceId: service.id }] },
      professionalLocations: { create: [{ locationId: location.id }] },
    },
  });
  const professionalB = await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      name: "Profesional B (otro)",
      active: true,
      services: { create: [{ serviceId: service.id }] },
      professionalLocations: { create: [{ locationId: location.id }] },
    },
  });

  const clientBooked = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente con la cita", phone: "+573000000010" },
  });
  const clientAnyProfessional = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente en espera (cualquiera)", phone: "+573000000011" },
  });
  const clientWantsOther = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente en espera (pide a B)", phone: "+573000000012" },
  });
  const clientNoPhone = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente en espera (sin teléfono válido)", phone: null },
  });

  // Orden de creación importa: el más antiguo debe ganar si varios matchean.
  await prisma.waitlistEntry.create({
    data: { tenantId: tenant.id, locationId: location.id, clientId: clientNoPhone.id, serviceId: service.id },
  });
  await new Promise((r) => setTimeout(r, 10));
  await prisma.waitlistEntry.create({
    data: { tenantId: tenant.id, locationId: location.id, clientId: clientWantsOther.id, serviceId: service.id, professionalId: professionalB.id },
  });
  await new Promise((r) => setTimeout(r, 10));
  await prisma.waitlistEntry.create({
    data: { tenantId: tenant.id, locationId: location.id, clientId: clientAnyProfessional.id, serviceId: service.id },
  });

  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  const appointment = await prisma.appointment.create({
    data: {
      tenantId: tenant.id,
      locationId: location.id,
      professionalId: professionalA.id,
      serviceId: service.id,
      clientId: clientBooked.id,
      startsAt,
      endsAt,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });

  console.log(`
QA listo — tenant "QA Waitlist" (${SLUG}), plan PREMIUM.

Cita a cancelar: ${appointment.id} (Profesional A, servicio "${service.name}", Sede QA).

Candidatos en lista de espera, en orden de creación (más antiguo primero):
  1. "${clientNoPhone.name}" — sin profesional puntual, PERO sin teléfono válido -> debe ser descartado.
  2. "${clientWantsOther.name}" — pide específicamente a Profesional B -> NO debe matchear (la cita es de A).
  3. "${clientAnyProfessional.name}" — cualquier profesional, CON teléfono -> DEBE ser el match ganador.

Siguiente paso: npx tsx prisma/qa-waitlist-verify.ts
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
