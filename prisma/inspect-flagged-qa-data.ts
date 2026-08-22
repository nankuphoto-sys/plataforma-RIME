// Complemento de auditoria de prisma/audit-demo-tenant.ts.
// Solo lectura: muestra el detalle de las citas colgando de la sede
// "Sede QA Fix Verificacion" y del profesional "QA Verificacion Profesionales"
// en el tenant consultorio-demo, para confirmar a ojo que son datos de la
// propia sesion de QA antes de decidir borrarlos.
//
// Uso:
//   npx tsx prisma/inspect-flagged-qa-data.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FLAGGED_LOCATION_ID = "cms73hw5f0002v37ijvx50oue"; // "Sede QA Fix Verificacion"
const FLAGGED_PROFESSIONAL_ID = "cms75y3ig0002vh7z8o4dmrsd"; // "QA Verificacion Profesionales"

async function main() {
  console.log(`Citas en "Sede QA Fix Verificacion" (locationId=${FLAGGED_LOCATION_ID}):\n`);

  const appointments = await prisma.appointment.findMany({
    where: { locationId: FLAGGED_LOCATION_ID },
    include: { client: true, service: true, professional: true },
    orderBy: { createdAt: "asc" },
  });

  for (const a of appointments) {
    console.log(`- Appointment ${a.id}`);
    console.log(`    status: ${a.status}  |  source: ${a.source}`);
    console.log(`    creada: ${a.createdAt.toISOString()}`);
    console.log(`    inicia: ${a.startsAt.toISOString()}`);
    console.log(`    servicio: "${a.service.name}"`);
    console.log(`    profesional: "${a.professional.name}" (id=${a.professionalId})`);
    console.log(`    cliente: "${a.client.name}"  |  telefono: ${a.client.phone ?? "(sin telefono)"}  |  email: ${a.client.email ?? "(sin email)"}`);
    console.log("");
  }

  if (!appointments.length) {
    console.log("  (no se encontró ninguna cita — raro, el audit anterior había contado 2)\n");
  }

  console.log(`\nDetalle del profesional "QA Verificacion Profesionales" (id=${FLAGGED_PROFESSIONAL_ID}):\n`);

  // Nota: el campo de relación en el schema se llama "services", no
  // "professionalServices" (ese fue el bug de la primera versión de este
  // script — Prisma tira un error de validación con un include inexistente,
  // y el .catch(() => null) de abajo lo disfrazaba de "no encontrado").
  const professional = await prisma.professional.findUnique({
    where: { id: FLAGGED_PROFESSIONAL_ID },
    include: {
      professionalLocations: { include: { location: true } },
      services: { include: { service: true } },
    },
  });

  if (!professional) {
    console.log("  Efectivamente no existe ningún profesional con ese id.");
  } else {
    console.log(`  nombre: "${professional.name}"`);
    console.log(`  activo: ${professional.active}`);
    console.log(`  sedes asignadas: ${professional.professionalLocations.map((pl) => pl.location.name).join(", ") || "(ninguna)"}`);
    console.log(`  servicios asignados: ${professional.services.map((ps) => ps.service.name).join(", ") || "(ninguno)"}`);

    const totalAppointments = await prisma.appointment.count({ where: { professionalId: FLAGGED_PROFESSIONAL_ID } });
    const otherLocationAppointments = await prisma.appointment.count({
      where: { professionalId: FLAGGED_PROFESSIONAL_ID, locationId: { not: FLAGGED_LOCATION_ID } },
    });
    console.log(`  citas totales: ${totalAppointments}  |  en OTRAS sedes (fuera de la sospechosa): ${otherLocationAppointments}`);
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
