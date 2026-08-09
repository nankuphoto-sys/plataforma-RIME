// Script de QA descartable — arma un tenant BARBERIA con un cliente que
// tiene: ficha con campos de la plantilla nueva de BARBERIA, 3 citas
// COMPLETED en 3 semanas consecutivas (para la racha de constancia) y un
// paquete de sesiones (para confirmar que también sale en el export).
//
// Uso:
//   npx tsx prisma/qa-portabilidad-racha.ts
//   npx tsx prisma/qa-portabilidad-racha-verify.ts
//   npx tsx prisma/qa-portabilidad-racha-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG = "qa-portabilidad-racha";
const OWNER_EMAIL = "owner-portabilidad-racha-qa@qa.test";
const PASSWORD = "QaPortabilidad123!";

// Ancla directo a Date.now() menos un par de horas (en vez de "hoy a las N
// en hora de Bogotá") para garantizar que la cita de "semana 0" siempre
// quede en el pasado sin importar la hora UTC real al correr el script —
// una hora fija de pared podía caer en el futuro si el reloj real todavía no
// llegaba a esa hora ese día, corriendo todos los buckets de la racha un
// lugar (bug detectado en vivo: dio racha 2 en vez de 3 la primera vez).
function weeksAgo(weeks: number): Date {
  return new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000);
}

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(
      `Ya existe un tenant con slug "${SLUG}". Corré primero "npx tsx prisma/qa-portabilidad-racha-cleanup.ts".`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: { name: "QA Portabilidad y Racha", slug: SLUG, plan: "PREMIUM", status: "ACTIVE", vertical: "BARBERIA" },
  });

  const location = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede QA", timezone: "America/Bogota" },
  });

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      name: "Owner QA",
      passwordHash,
      locationRoles: { create: [{ locationId: location.id, role: "OWNER" }] },
    },
  });

  const service = await prisma.service.create({
    data: { tenantId: tenant.id, name: "Corte + barba", durationMinutes: 40, price: 25, active: true },
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
    data: {
      tenantId: tenant.id,
      name: "Cliente QA Barbería",
      phone: "+573000000088",
      customFields: {
        estiloPreferido: "Degradado (fade)",
        maquinaMillimetro: "N°2 costados, tijera arriba",
        productosPreferidos: "Cera mate",
      },
    },
  });

  // 3 citas COMPLETED en 3 semanas consecutivas (semana actual, -1, -2) para
  // que la racha dé 3, más una 4ta hace 5 semanas (hueco) que NO debe sumar.
  for (const weeks of [0, 1, 2, 5]) {
    const startsAt = weeksAgo(weeks);
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
        status: "COMPLETED",
        source: "MANUAL",
      },
    });
  }

  await prisma.sessionPackage.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      serviceId: service.id,
      totalSessions: 5,
      usedSessions: 1,
      status: "ACTIVE",
    },
  });

  console.log(`
QA listo — tenant "QA Portabilidad y Racha" (${SLUG}), plan PREMIUM, vertical BARBERIA.

Login OWNER:
  email:    ${owner.email}
  password: ${PASSWORD}
URL cliente: /dashboard/${SLUG}/clients/${client.id}

Sembrado: 4 citas COMPLETED (semanas 0, 1, 2 consecutivas + semana 5 con
hueco) -> racha esperada: 3. Ficha con 3 campos de la plantilla BARBERIA.
1 paquete de sesiones (1/5 usadas).

Siguiente paso: npx tsx prisma/qa-portabilidad-racha-verify.ts
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
