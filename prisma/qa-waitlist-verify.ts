// Ejercita, contra los datos reales sembrados por qa-waitlist.ts, la MISMA
// lógica que corre dentro de la transacción de updateAppointmentStatusAction
// al cancelar una cita (replicada acá — esa Server Action depende de auth(),
// que este entorno no puede simular sin navegador/sesión HTTP real):
// buscar candidatos WAITING del servicio+sede, filtrar por teléfono válido,
// encontrar el mejor match con findBestWaitlistMatch, y marcarlo NOTIFIED.
// Deliberadamente NO se llama a sendWaitlistSlotOpenedWhatsAppMessage —
// WHATSAPP_CLOUD_API_TOKEN es una credencial real de Meta y la plantilla
// "cupo_lista_espera" no existe/no está aprobada, mismo criterio ya
// documentado para las otras plantillas nuevas de este proyecto.
//
// Uso: npx tsx prisma/qa-waitlist-verify.ts

import { PrismaClient } from "@prisma/client";
import { findBestWaitlistMatch } from "../src/lib/waitlist";
import { normalizePhoneForWhatsapp } from "../src/lib/whatsapp";

const prisma = new PrismaClient();

const SLUG = "qa-waitlist";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.log(`No existe el tenant "${SLUG}". Corré primero "npx tsx prisma/qa-waitlist.ts".`);
    process.exit(1);
  }

  const appointment = await prisma.appointment.findFirstOrThrow({
    where: { tenantId: tenant.id },
    include: { service: true },
  });

  console.log(`Cancelando (simulado) la cita ${appointment.id} — Profesional ${appointment.professionalId}\n`);

  const waitingEntries = await prisma.waitlistEntry.findMany({
    where: {
      tenantId: tenant.id,
      locationId: appointment.locationId,
      serviceId: appointment.serviceId,
      status: "WAITING",
    },
    include: { client: true },
    orderBy: { createdAt: "asc" },
  });

  console.log("--- Candidatos WAITING encontrados (antes de filtrar por teléfono) ---");
  for (const entry of waitingEntries) {
    console.log(`${entry.client.name}: professionalId=${entry.professionalId ?? "cualquiera"}, phone=${entry.client.phone ?? "null"}`);
  }

  const candidatesWithPhone = waitingEntries
    .map((entry) => ({ entry, normalizedPhone: entry.client.phone ? normalizePhoneForWhatsapp(entry.client.phone) : null }))
    .filter((c): c is typeof c & { normalizedPhone: string } => c.normalizedPhone !== null);

  console.log(`\nCandidatos con teléfono válido: ${candidatesWithPhone.map((c) => c.entry.client.name).join(", ")}`);

  const bestMatch = findBestWaitlistMatch(
    candidatesWithPhone.map((c) => c.entry),
    {
      locationId: appointment.locationId,
      serviceId: appointment.serviceId,
      professionalId: appointment.professionalId,
      startsAt: appointment.startsAt,
    }
  );

  if (!bestMatch) {
    console.log("\nNo hubo match. ESPERADO: debería haber matcheado con 'Cliente en espera (cualquiera)'.");
    process.exit(1);
  }

  const matched = candidatesWithPhone.find((c) => c.entry.id === bestMatch.id)!;
  console.log(`\nMatch ganador: "${matched.entry.client.name}" (esperado: "Cliente en espera (cualquiera)")`);

  await prisma.waitlistEntry.update({
    where: { id: bestMatch.id },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });

  const finalStates = await prisma.waitlistEntry.findMany({
    where: { tenantId: tenant.id },
    include: { client: true },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n--- Estado final de todos los registros de lista de espera ---");
  for (const entry of finalStates) {
    console.log(`${entry.client.name}: status=${entry.status}`);
  }
  console.log(
    "\nEsperado: solo 'Cliente en espera (cualquiera)' en NOTIFIED, los otros 2 siguen en WAITING (nunca se les avisó)."
  );

  console.log("\nListo. Limpiá todo con: npx tsx prisma/qa-waitlist-cleanup.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
