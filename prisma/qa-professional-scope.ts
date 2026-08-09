// Script de QA descartable — NO es parte del seed de desarrollo normal.
// Crea un tenant nuevo, autocontenido, para verificar en vivo la fase
// "Vista solo lo mío para login PROFESSIONAL" (ver CLAUDE.md). Pensado para
// correr en tu máquina real (el sandbox de Cowork no tiene acceso de red a
// la base de datos ni puede generar el engine de Prisma para Linux).
//
// Uso:
//   npx tsx prisma/qa-professional-scope.ts
//
// Al terminar de verificar, borrar todo con:
//   npx tsx prisma/qa-professional-scope-cleanup.ts
//
// (el delete de Tenant hace cascade sobre Location/User/Professional/
// Client/Service/Appointment/StaffLocationRole/ProfessionalLocation
// automáticamente, no deja nada huérfano).

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getTodayInTimezone, getWeekDates, zonedTimeToUtc } from "../src/lib/availability";

const prisma = new PrismaClient();

const TENANT_SLUG = "qa-solo-lo-mio";
const PASSWORD = "QaSoloLoMio123!";

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (existing) {
    console.log(
      `Ya existe un tenant con slug "${TENANT_SLUG}" (id ${existing.id}). Corré primero ` +
        `"npx tsx prisma/qa-professional-scope-cleanup.ts" y volvé a correr este script.`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Solo Lo Mío",
      slug: TENANT_SLUG,
      plan: "PREMIUM",
      status: "TRIAL",
      vertical: "GENERAL",
    },
  });

  const location = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede QA", timezone: "America/Santiago" },
  });

  // OWNER — para el caso (5): un usuario con otro rol debe seguir viendo todo.
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner-qa-solo-lo-mio@qa.test",
      name: "Owner QA",
      passwordHash,
      locationRoles: { create: { locationId: location.id, role: "OWNER" } },
    },
  });

  const service = await prisma.service.create({
    data: { tenantId: tenant.id, name: "Consulta QA", durationMinutes: 50, price: 30 },
  });

  const client = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      name: "Cliente Compartido QA",
      email: "cliente-compartido-qa@qa.test",
    },
  });

  // Dos profesionales, cada uno con su propio login PROFESSIONAL en la misma
  // sede — el escenario exacto que pide CLAUDE.md para esta verificación.
  async function createLinkedProfessional(label: "A" | "B") {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `profesional-${label.toLowerCase()}-qa@qa.test`,
        name: `Profesional ${label} (QA)`,
        passwordHash,
        locationRoles: { create: { locationId: location.id, role: "PROFESSIONAL" } },
      },
    });

    const professional = await prisma.professional.create({
      data: {
        tenantId: tenant.id,
        name: `Profesional ${label} (QA)`,
        userId: user.id,
        professionalLocations: { create: { locationId: location.id } },
        services: { create: { serviceId: service.id } },
      },
    });

    return { user, professional };
  }

  const profA = await createLinkedProfessional("A");
  const profB = await createLinkedProfessional("B");

  // Una cita del cliente compartido con CADA profesional, ambas COMPLETED
  // para que aparezcan en "Historial de citas". Días distintos de la semana
  // actual para no pisarse en el calendario.
  const today = getTodayInTimezone(location.timezone);
  const weekDates = getWeekDates(today);

  async function createAppointment(professionalId: string, dayIndex: number, hour: number) {
    const date = weekDates[dayIndex];
    const startsAt = zonedTimeToUtc(date, hour, 0, location.timezone);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    return prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        professionalId,
        serviceId: service.id,
        clientId: client.id,
        startsAt,
        endsAt,
        status: "COMPLETED",
        source: "MANUAL",
      },
    });
  }

  const apptA = await createAppointment(profA.professional.id, 1, 10);
  const apptB = await createAppointment(profB.professional.id, 2, 11);

  console.log(`
QA listo — tenant "${tenant.name}" (${TENANT_SLUG}).

Login OWNER (debe seguir viendo todo sin cambios):
  email:    ${owner.email}
  password: ${PASSWORD}

Login Profesional A (debe ver SOLO su agenda y SOLO al cliente compartido con su cita de A):
  email:    ${profA.user.email}
  password: ${PASSWORD}
  professionalId: ${profA.professional.id}
  appointmentId (suya, COMPLETED, martes 10:00): ${apptA.id}

Login Profesional B (debe ver SOLO su agenda y SOLO su cita con el cliente compartido):
  email:    ${profB.user.email}
  password: ${PASSWORD}
  professionalId: ${profB.professional.id}
  appointmentId (suya, COMPLETED, miércoles 11:00): ${apptB.id}

Cliente compartido: ${client.name} (${client.id}) — tiene una cita con A y otra con B.

URL del dashboard: /dashboard/${TENANT_SLUG}

Cuando termines de verificar, limpiá todo con:
  npx tsx prisma/qa-professional-scope-cleanup.ts
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
