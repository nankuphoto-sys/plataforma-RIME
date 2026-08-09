import type { Prisma } from "@prisma/client";

// Mantiene el StaffLocationRole(PROFESSIONAL) de un profesional en sincronía
// con su checklist de sedes asignadas (ProfessionalLocation) — sin esto, un
// profesional recién asignado a una sede nueva no puede ni ver su agenda ahí
// (no tiene ningún StaffLocationRole en esa sede), y uno desasignado
// conserva acceso viejo indefinidamente. Pensadas para correr DENTRO de la
// misma transacción que ya hace el set-replace de ProfessionalLocation (ver
// applyProfessionalLocationsUpdate en professionals/actions.ts y
// applyLocationProfessionalsUpdate en locations/actions.ts, los dos lugares
// donde se edita esta relación).
//
// Regla de oro en ambas direcciones: NUNCA tocar un rol que no sea
// exactamente PROFESSIONAL. Esto es lo que evita romper el caso ya resuelto
// en la fase de vínculo Profesional↔Usuario de "el OWNER se vincula a sí
// mismo como su propio profesional" — si a ese OWNER lo desasignan de una
// sede como profesional, su rol OWNER ahí queda intacto.

export interface ProfessionalLocationPair {
  professionalId: string;
  locationId: string;
}

// Otorga StaffLocationRole(PROFESSIONAL) para cada par (profesional, sede)
// recién asignado — solo si el profesional tiene un usuario vinculado, y
// solo si ese usuario TODAVÍA no tiene ningún rol en esa sede (si ya tiene
// uno, sea PROFESSIONAL de antes o cualquier otro rol, se deja intacto).
export async function grantProfessionalLocationAccess(
  tx: Prisma.TransactionClient,
  pairs: ProfessionalLocationPair[]
): Promise<void> {
  if (pairs.length === 0) return;

  const professionalIds = [...new Set(pairs.map((pair) => pair.professionalId))];
  const linkedProfessionals = await tx.professional.findMany({
    where: { id: { in: professionalIds }, userId: { not: null } },
    select: { id: true, userId: true },
  });
  const userIdByProfessionalId = new Map(linkedProfessionals.map((p) => [p.id, p.userId as string]));

  for (const pair of pairs) {
    const userId = userIdByProfessionalId.get(pair.professionalId);
    if (!userId) continue; // profesional sin usuario vinculado — nada que otorgar

    await tx.staffLocationRole.upsert({
      where: { userId_locationId: { userId, locationId: pair.locationId } },
      create: { userId, locationId: pair.locationId, role: "PROFESSIONAL" },
      // Ya existe un rol en esa sede (PROFESSIONAL de antes, o
      // OWNER/ADMIN/STAFF) — nunca lo pisamos.
      update: {},
    });
  }
}

// Revoca StaffLocationRole(PROFESSIONAL) para cada par (profesional, sede)
// recién desasignado — solo si el profesional tiene un usuario vinculado, y
// el `role: "PROFESSIONAL"` en el where hace que el delete sea un no-op
// silencioso si el rol actual del usuario en esa sede es otro (ej. OWNER).
export async function revokeProfessionalLocationAccess(
  tx: Prisma.TransactionClient,
  pairs: ProfessionalLocationPair[]
): Promise<void> {
  if (pairs.length === 0) return;

  const professionalIds = [...new Set(pairs.map((pair) => pair.professionalId))];
  const linkedProfessionals = await tx.professional.findMany({
    where: { id: { in: professionalIds }, userId: { not: null } },
    select: { id: true, userId: true },
  });
  const userIdByProfessionalId = new Map(linkedProfessionals.map((p) => [p.id, p.userId as string]));

  for (const pair of pairs) {
    const userId = userIdByProfessionalId.get(pair.professionalId);
    if (!userId) continue;

    await tx.staffLocationRole.deleteMany({
      where: { userId, locationId: pair.locationId, role: "PROFESSIONAL" },
    });
  }
}
