// Ejercita, contra los datos reales sembrados por qa-auto-followup.ts, la
// MISMA lógica que corre dentro de la transacción de
// updateAppointmentStatusAction al completar una cita (replicada acá — esa
// Server Action depende de auth(), que este entorno no puede simular sin
// navegador/sesión HTTP real): calcular el slot candidato, buscar choques
// del mismo profesional, y crear el seguimiento solo si está libre Y la
// vertical del tenant es de salud.
//
// Uso: npx tsx prisma/qa-auto-followup-verify.ts

import { PrismaClient } from "@prisma/client";
import { computeFollowUpSlot, isAutoFollowUpVertical, isFollowUpSlotFree } from "../src/lib/followUpScheduling";

const prisma = new PrismaClient();

async function maybeCreateFollowUp(appointmentId: string): Promise<{ created: boolean; reason: string }> {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { service: true, tenant: true },
  });

  if (!isAutoFollowUpVertical(appointment.tenant.vertical)) {
    return { created: false, reason: `vertical ${appointment.tenant.vertical} no es de salud` };
  }

  const candidate = computeFollowUpSlot(appointment.startsAt, appointment.service.durationMinutes);

  const overlapping = await prisma.appointment.findMany({
    where: {
      professionalId: appointment.professionalId,
      status: { not: "CANCELLED" },
      startsAt: { lt: candidate.endsAt },
      endsAt: { gt: candidate.startsAt },
    },
    select: { startsAt: true, endsAt: true },
  });

  if (!isFollowUpSlotFree(candidate, overlapping)) {
    return { created: false, reason: "el horario candidato choca con otra cita del profesional" };
  }

  await prisma.appointment.create({
    data: {
      tenantId: appointment.tenantId,
      locationId: appointment.locationId,
      professionalId: appointment.professionalId,
      serviceId: appointment.serviceId,
      clientId: appointment.clientId,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      status: "PENDING",
      source: "AUTO_FOLLOWUP",
    },
  });
  return { created: true, reason: "horario libre" };
}

async function main() {
  const healthTenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "qa-autofollowup-salud" } });
  const nonHealthTenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "qa-autofollowup-estetica" } });

  const freeAppointment = await prisma.appointment.findFirstOrThrow({
    where: { tenantId: healthTenant.id, client: { name: "Cliente QA" }, status: "CONFIRMED" },
    orderBy: { startsAt: "asc" },
  });
  const occupiedAppointment = await prisma.appointment.findFirstOrThrow({
    where: { tenantId: healthTenant.id, client: { name: "Cliente QA" }, status: "CONFIRMED" },
    orderBy: { startsAt: "desc" },
  });
  const nonHealthAppointment = await prisma.appointment.findFirstOrThrow({
    where: { tenantId: nonHealthTenant.id },
  });

  console.log("--- Escenario 1: cita libre en vertical de salud ---");
  const r1 = await maybeCreateFollowUp(freeAppointment.id);
  console.log(`created=${r1.created} (${r1.reason}) — esperado: created=true`);

  console.log("\n--- Escenario 2: cita ocupada en vertical de salud ---");
  const r2 = await maybeCreateFollowUp(occupiedAppointment.id);
  console.log(`created=${r2.created} (${r2.reason}) — esperado: created=false`);

  console.log("\n--- Escenario 3: cita en vertical NO de salud (ESTETICA) ---");
  const r3 = await maybeCreateFollowUp(nonHealthAppointment.id);
  console.log(`created=${r3.created} (${r3.reason}) — esperado: created=false`);

  console.log("\n--- Citas de seguimiento realmente creadas (debería haber exactamente 1) ---");
  const created = await prisma.appointment.findMany({ where: { source: "AUTO_FOLLOWUP" } });
  for (const a of created) {
    console.log(`${a.id}: tenantId=${a.tenantId}, startsAt=${a.startsAt.toISOString()}, status=${a.status}`);
  }
  console.log(`Total: ${created.length} (esperado: 1)`);

  console.log("\nListo. Limpiá todo con: npx tsx prisma/qa-auto-followup-cleanup.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
