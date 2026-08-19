"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwnerAccess } from "@/lib/auth-guards";
import { getPlanLimits, hasReachedLocationLimit } from "@/lib/planLimits";
import { grantProfessionalLocationAccess, revokeProfessionalLocationAccess } from "@/lib/professionalLocationSync";

const DEFAULT_TIMEZONE = "America/Bogota";

function parseLocationFields(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const address = formData.get("address")?.toString().trim() || null;
  const timezone = formData.get("timezone")?.toString().trim() || DEFAULT_TIMEZONE;
  return { name, address, timezone };
}

// Actualiza solo nombre/dirección/timezone. Devuelve un mensaje de error si
// la validación falla, o null si todo salió bien.
async function applyLocationFieldsUpdate(locationId: string, formData: FormData): Promise<string | null> {
  const { name, address, timezone } = parseLocationFields(formData);
  if (!name) return "El nombre es obligatorio.";

  await prisma.location.update({ where: { id: locationId }, data: { name, address, timezone } });
  return null;
}

// Set-replace completo de las asignaciones ProfessionalLocation de una sede,
// a partir de la lista de professionalId marcados en el checklist — borra
// las que ya no están marcadas y crea las que faltan, dentro de una
// transacción. Valida que cada professionalId pertenezca al tenant antes de
// asignarlo (nunca confiar en los ids que llegan del form). Además
// resincroniza StaffLocationRole(PROFESSIONAL) contra el diff — mismo
// mecanismo (y misma protección de nunca pisar OWNER/ADMIN/STAFF) que
// applyProfessionalLocationsUpdate en professionals/actions.ts, la otra
// punta desde donde se edita esta misma relación. Ver
// src/lib/professionalLocationSync.ts.
async function applyLocationProfessionalsUpdate(
  tenantId: string,
  locationId: string,
  formData: FormData
): Promise<void> {
  const submittedIds = formData.getAll("professionalIds").map((value) => value.toString());

  const validProfessionals = submittedIds.length
    ? await prisma.professional.findMany({
        where: { id: { in: submittedIds }, tenantId },
        select: { id: true },
      })
    : [];
  const validIds = validProfessionals.map((professional) => professional.id);

  const currentAssignments = await prisma.professionalLocation.findMany({
    where: { locationId },
    select: { professionalId: true },
  });
  const currentIds = currentAssignments.map((assignment) => assignment.professionalId);
  const addedProfessionalIds = validIds.filter((id) => !currentIds.includes(id));
  const removedProfessionalIds = currentIds.filter((id) => !validIds.includes(id));

  await prisma.$transaction(async (tx) => {
    await tx.professionalLocation.deleteMany({
      where: { locationId, professionalId: { notIn: validIds } },
    });
    for (const professionalId of validIds) {
      await tx.professionalLocation.upsert({
        where: { professionalId_locationId: { professionalId, locationId } },
        create: { professionalId, locationId },
        update: {},
      });
    }

    await grantProfessionalLocationAccess(
      tx,
      addedProfessionalIds.map((professionalId) => ({ professionalId, locationId }))
    );
    await revokeProfessionalLocationAccess(
      tx,
      removedProfessionalIds.map((professionalId) => ({ professionalId, locationId }))
    );
  });
}

export async function createLocationAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireOwnerAccess(tenantSlug);

  const { name, address, timezone } = parseLocationFields(formData);
  if (!name) {
    redirect(
      `/dashboard/${tenantSlug}/locations/new?error=${encodeURIComponent("El nombre es obligatorio.")}`
    );
  }

  if (hasReachedLocationLimit(tenant.plan, tenant.locations.length)) {
    const { maxLocations } = getPlanLimits(tenant.plan);
    redirect(
      `/dashboard/${tenantSlug}/locations/new?error=${encodeURIComponent(
        `Tu plan (${tenant.plan}) permite hasta ${maxLocations} sede${maxLocations === 1 ? "" : "s"}. Sube de plan para agregar más.`
      )}`
    );
  }

  // Toda sede nueva debe nacer con acceso para sus OWNERs — si no, el
  // propio OWNER que la crea queda sin poder gestionarla hasta que alguien
  // le asigne el StaffLocationRole a mano. Buscamos los OWNER de cualquier
  // otra sede del tenant (puede haber más de uno) antes de la transacción.
  const ownerUserIds = await prisma.staffLocationRole.findMany({
    where: { role: "OWNER", location: { tenantId: tenant.id } },
    select: { userId: true },
    distinct: ["userId"],
  });

  const location = await prisma.$transaction(async (tx) => {
    const created = await tx.location.create({
      data: { tenantId: tenant.id, name, address, timezone },
    });
    if (ownerUserIds.length > 0) {
      await tx.staffLocationRole.createMany({
        data: ownerUserIds.map((owner) => ({
          userId: owner.userId,
          locationId: created.id,
          role: "OWNER" as const,
        })),
        skipDuplicates: true,
      });
    }
    return created;
  });

  revalidatePath(`/dashboard/${tenantSlug}/locations`);
  redirect(`/dashboard/${tenantSlug}/locations/${location.id}`);
}

export async function updateLocationAction(
  tenantSlug: string,
  locationId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireOwnerAccess(tenantSlug);

  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: tenant.id } });
  if (!location) notFound();

  const error = await applyLocationFieldsUpdate(location.id, formData);
  if (error) {
    redirect(`/dashboard/${tenantSlug}/locations/${locationId}?error=${encodeURIComponent(error)}`);
  }

  revalidatePath(`/dashboard/${tenantSlug}/locations/${locationId}`);
  revalidatePath(`/dashboard/${tenantSlug}/locations`);
  redirect(`/dashboard/${tenantSlug}/locations/${locationId}`);
}

export async function updateLocationProfessionalsAction(
  tenantSlug: string,
  locationId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireOwnerAccess(tenantSlug);

  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: tenant.id } });
  if (!location) notFound();

  await applyLocationProfessionalsUpdate(tenant.id, location.id, formData);

  revalidatePath(`/dashboard/${tenantSlug}/locations/${locationId}`);
  redirect(`/dashboard/${tenantSlug}/locations/${locationId}`);
}

// Usada por el único formulario de [locationId]/page.tsx: un solo botón
// "Guardar" que actualiza a la vez los datos de la sede y las asignaciones
// de profesionales (reutiliza la misma lógica que las dos acciones de
// arriba, sin duplicarla).
export async function updateLocationAndProfessionalsAction(
  tenantSlug: string,
  locationId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireOwnerAccess(tenantSlug);

  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: tenant.id } });
  if (!location) notFound();

  const error = await applyLocationFieldsUpdate(location.id, formData);
  if (error) {
    redirect(`/dashboard/${tenantSlug}/locations/${locationId}?error=${encodeURIComponent(error)}`);
  }

  await applyLocationProfessionalsUpdate(tenant.id, location.id, formData);

  revalidatePath(`/dashboard/${tenantSlug}/locations/${locationId}`);
  revalidatePath(`/dashboard/${tenantSlug}/locations`);
  redirect(`/dashboard/${tenantSlug}/locations/${locationId}?saved=1`);
}
