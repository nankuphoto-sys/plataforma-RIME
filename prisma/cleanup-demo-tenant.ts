// Fase 0, tarea 0-1 — parte final: borra los datos de prueba ya confirmados
// a mano en el tenant consultorio-demo:
//   - las 2 citas de "Cliente Demo" / +56900000000 / cliente@demo.com
//   - la sede "Sede QA Fix Verificacion", una vez que ya no tiene citas colgando
//   - el profesional "QA Verificacion Profesionales" (inactivo, sin sedes,
//     sin servicios, sin ninguna cita en ningún lado — verificado con
//     prisma/inspect-flagged-qa-data.ts antes de tocarlo)
//
// IDs hardcodeados a propósito (no por patrón de nombre) porque ya fueron
// verificados a mano con prisma/inspect-flagged-qa-data.ts — a diferencia de
// audit-demo-tenant.ts, este script no adivina nada, solo ejecuta lo ya
// decidido.
//
// Uso:
//   npx tsx prisma/cleanup-demo-tenant.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPOINTMENT_IDS = ["cmt0kfeyh000kjqks5frnlpc9", "cmt0kgt69000njqkspzzobf4h"];
const LOCATION_ID = "cms73hw5f0002v37ijvx50oue"; // "Sede QA Fix Verificacion"
const PROFESSIONAL_ID = "cms75y3ig0002vh7z8o4dmrsd"; // "QA Verificacion Profesionales"

async function main() {
  for (const id of APPOINTMENT_IDS) {
    const appt = await prisma.appointment.findUnique({ where: { id }, include: { client: true } });
    if (!appt) {
      console.log(`Appointment ${id} ya no existe — se salta.`);
      continue;
    }
    if (appt.client.email !== "cliente@demo.com" || appt.client.phone !== "+56900000000") {
      console.log(`⚠️  Appointment ${id} no coincide con los datos verificados (cliente distinto) — SE SALTA por seguridad. Revisar a mano.`);
      continue;
    }
    await prisma.appointment.delete({ where: { id } });
    console.log(`✅ Borrada appointment ${id} (cliente "${appt.client.name}")`);
  }

  const remaining = await prisma.appointment.count({ where: { locationId: LOCATION_ID } });
  if (remaining > 0) {
    console.log(`\n⚠️  Todavía quedan ${remaining} cita(s) en la sede — no se borra la sede. Revisar a mano.`);
    return;
  }

  const location = await prisma.location.findUnique({ where: { id: LOCATION_ID } });
  if (!location) {
    console.log("\nLa sede ya no existe — nada más para hacer.");
    return;
  }

  await prisma.location.delete({ where: { id: LOCATION_ID } });
  console.log(`\n✅ Borrada la sede "${location.name}" (${LOCATION_ID}).`);

  const professional = await prisma.professional.findUnique({
    where: { id: PROFESSIONAL_ID },
    include: { professionalLocations: true, services: true },
  });
  if (!professional) {
    console.log("\nEl profesional \"QA Verificacion Profesionales\" ya no existe — nada más para hacer.");
    return;
  }
  if (professional.active || professional.professionalLocations.length || professional.services.length) {
    console.log(
      `\n⚠️  El profesional "${professional.name}" ya no coincide con lo verificado (activo=${professional.active}, sedes=${professional.professionalLocations.length}, servicios=${professional.services.length}) — SE SALTA por seguridad. Revisar a mano.`
    );
    return;
  }
  const otherAppointments = await prisma.appointment.count({ where: { professionalId: PROFESSIONAL_ID } });
  if (otherAppointments > 0) {
    console.log(`\n⚠️  El profesional "${professional.name}" ahora tiene ${otherAppointments} cita(s) — SE SALTA por seguridad. Revisar a mano.`);
    return;
  }

  await prisma.professional.delete({ where: { id: PROFESSIONAL_ID } });
  console.log(`✅ Borrado el profesional "${professional.name}" (${PROFESSIONAL_ID}).`);
  console.log("\nTarea 0-1 lista: 2 citas de prueba, la sede y el profesional de QA, todos borrados del tenant demo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
