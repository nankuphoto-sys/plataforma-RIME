import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getTodayInTimezone, getWeekDates, zonedTimeToUtc } from "../src/lib/availability";

const prisma = new PrismaClient();

// Credenciales de demo — ver README.md.
const DEMO_OWNER_PASSWORD = "demo1234";

async function main() {
  const ownerPasswordHash = await bcrypt.hash(DEMO_OWNER_PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name: "Consultorio Demo",
      slug: "consultorio-demo",
      plan: "PREMIUM",
      status: "TRIAL",
      vertical: "PSICOLOGIA",
    },
  });

  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: "Sede Principal",
      address: "Av. Siempre Viva 123",
      timezone: "America/Santiago",
    },
  });

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner@demo.com",
      name: "Dueña Demo",
      passwordHash: ownerPasswordHash,
      locationRoles: {
        create: { locationId: location.id, role: "OWNER" },
      },
    },
  });

  const professional = await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      name: "Prof. Demo",
      bio: "Psicóloga clínica",
      userId: owner.id,
    },
  });

  const service = await prisma.service.create({
    data: {
      tenantId: tenant.id,
      name: "Primera consulta",
      durationMinutes: 50,
      price: 35.0,
      professionals: {
        create: { professionalId: professional.id },
      },
    },
  });

  const client = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      name: "Cliente Demo",
      email: "cliente@demo.com",
      phone: "+56900000000",
      // Ejemplo de ficha configurable por vertical (aquí: salud mental)
      customFields: {
        motivoConsulta: "Ansiedad",
        derivadoPor: "Autoagendado",
      },
    },
  });

  // Citas de ejemplo en la semana actual, con estados distintos, para que la
  // agenda interna (src/app/dashboard/[tenantSlug]) no se vea vacía al abrirla.
  const today = getTodayInTimezone(location.timezone);
  const weekDates = getWeekDates(today);

  const demoAppointments: {
    dayIndex: number;
    hour: number;
    minute: number;
    status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  }[] = [
    { dayIndex: 0, hour: 10, minute: 0, status: "PENDING" },
    { dayIndex: 1, hour: 14, minute: 0, status: "CONFIRMED" },
    { dayIndex: 2, hour: 11, minute: 0, status: "COMPLETED" },
    { dayIndex: 3, hour: 16, minute: 0, status: "CANCELLED" },
  ];

  for (const appt of demoAppointments) {
    const date = weekDates[appt.dayIndex];
    const startsAt = zonedTimeToUtc(date, appt.hour, appt.minute, location.timezone);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

    await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        professionalId: professional.id,
        serviceId: service.id,
        clientId: client.id,
        startsAt,
        endsAt,
        status: appt.status,
        source: "WEBSITE",
      },
    });
  }

  console.log("Seed listo:", { tenantId: tenant.id, serviceId: service.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
