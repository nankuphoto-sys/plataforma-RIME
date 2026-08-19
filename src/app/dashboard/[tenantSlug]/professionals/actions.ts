"use server";

import crypto from "crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProfessionalsManageAccess } from "@/lib/auth-guards";
import { getPlanLimits, hasReachedProfessionalLimit } from "@/lib/planLimits";
import { grantProfessionalLocationAccess, revokeProfessionalLocationAccess } from "@/lib/professionalLocationSync";

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTemporaryPassword(): string {
  // Mismo mecanismo que team/actions.ts (duplicado a propósito, ver el
  // prompt de esta fase: preferir duplicación mínima a tocar un archivo de
  // una fase anterior ya cerrada).
  return crypto.randomBytes(9).toString("base64url");
}

function parseProfessionalFields(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const bio = formData.get("bio")?.toString().trim() || null;
  const commissionRate = Number(formData.get("commissionRate")?.toString() ?? "0");
  const active = formData.get("active") === "on";
  return { name, bio, commissionRate, active };
}

function validateProfessionalFields(name: string, commissionRate: number): string | null {
  if (!name) return "El nombre es obligatorio.";
  if (Number.isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    return "La comisión debe ser un número entre 0 y 100.";
  }
  return null;
}

function professionalLimitError(plan: string, maxProfessionals: number | null): string {
  return `Tu plan (${plan}) permite hasta ${maxProfessionals} profesional${
    maxProfessionals === 1 ? "" : "es"
  } activo${maxProfessionals === 1 ? "" : "s"}. Desactiva otro profesional o sube de plan.`;
}

// Set-replace completo de las asignaciones ProfessionalService de un
// profesional, a partir de la lista de serviceId marcados en el checklist —
// borra las que ya no están marcadas y crea las que faltan, dentro de una
// transacción. Valida que cada serviceId pertenezca al tenant antes de
// asignarlo (nunca confiar en los ids que llegan del form). Mismo patrón que
// applyLocationProfessionalsUpdate en locations/actions.ts.
async function applyProfessionalServicesUpdate(
  tenantId: string,
  professionalId: string,
  formData: FormData
): Promise<void> {
  const submittedIds = formData.getAll("serviceIds").map((value) => value.toString());

  const validServices = submittedIds.length
    ? await prisma.service.findMany({
        where: { id: { in: submittedIds }, tenantId },
        select: { id: true },
      })
    : [];
  const validIds = validServices.map((service) => service.id);

  await prisma.$transaction([
    prisma.professionalService.deleteMany({
      where: { professionalId, serviceId: { notIn: validIds } },
    }),
    ...validIds.map((serviceId) =>
      prisma.professionalService.upsert({
        where: { professionalId_serviceId: { professionalId, serviceId } },
        create: { professionalId, serviceId },
        update: {},
      })
    ),
  ]);
}

// Mismo patrón que applyProfessionalServicesUpdate, para ProfessionalLocation
// — más la resincronización automática de StaffLocationRole(PROFESSIONAL)
// del profesional (si tiene un usuario vinculado) contra el diff de sedes
// agregadas/quitadas: sin esto, asignar una sede nueva no le daba acceso
// real para ver su agenda ahí, y desasignarlo dejaba acceso viejo colgado.
// Ver src/lib/professionalLocationSync.ts para la regla completa (nunca
// pisa/borra un rol que no sea exactamente PROFESSIONAL).
async function applyProfessionalLocationsUpdate(
  tenantId: string,
  professionalId: string,
  formData: FormData
): Promise<void> {
  const submittedIds = formData.getAll("locationIds").map((value) => value.toString());

  const validLocations = submittedIds.length
    ? await prisma.location.findMany({
        where: { id: { in: submittedIds }, tenantId },
        select: { id: true },
      })
    : [];
  const validIds = validLocations.map((location) => location.id);

  const currentAssignments = await prisma.professionalLocation.findMany({
    where: { professionalId },
    select: { locationId: true },
  });
  const currentIds = currentAssignments.map((assignment) => assignment.locationId);
  const addedLocationIds = validIds.filter((id) => !currentIds.includes(id));
  const removedLocationIds = currentIds.filter((id) => !validIds.includes(id));

  await prisma.$transaction(async (tx) => {
    await tx.professionalLocation.deleteMany({
      where: { professionalId, locationId: { notIn: validIds } },
    });
    for (const locationId of validIds) {
      await tx.professionalLocation.upsert({
        where: { professionalId_locationId: { professionalId, locationId } },
        create: { professionalId, locationId },
        update: {},
      });
    }

    await grantProfessionalLocationAccess(
      tx,
      addedLocationIds.map((locationId) => ({ professionalId, locationId }))
    );
    await revokeProfessionalLocationAccess(
      tx,
      removedLocationIds.map((locationId) => ({ professionalId, locationId }))
    );
  });
}

export async function createProfessionalAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireProfessionalsManageAccess(tenantSlug);

  const { name, bio, commissionRate, active } = parseProfessionalFields(formData);
  const fieldError = validateProfessionalFields(name, commissionRate);
  if (fieldError) {
    redirect(`/dashboard/${tenantSlug}/professionals/new?error=${encodeURIComponent(fieldError)}`);
  }

  // El tope de activos nunca bloquea crear un profesional inactivo, sin
  // importar cuántos activos haya.
  if (active) {
    const currentActiveCount = await prisma.professional.count({
      where: { tenantId: tenant.id, active: true },
    });
    if (hasReachedProfessionalLimit(tenant.plan, currentActiveCount)) {
      const { maxProfessionals } = getPlanLimits(tenant.plan);
      redirect(
        `/dashboard/${tenantSlug}/professionals/new?error=${encodeURIComponent(
          professionalLimitError(tenant.plan, maxProfessionals)
        )}`
      );
    }
  }

  const professional = await prisma.$transaction(async (tx) => {
    const created = await tx.professional.create({
      data: { tenantId: tenant.id, name, bio, commissionRate, active },
    });

    const serviceIds = formData.getAll("serviceIds").map((value) => value.toString());
    const validServices = serviceIds.length
      ? await tx.service.findMany({
          where: { id: { in: serviceIds }, tenantId: tenant.id },
          select: { id: true },
        })
      : [];
    if (validServices.length > 0) {
      await tx.professionalService.createMany({
        data: validServices.map((service) => ({ professionalId: created.id, serviceId: service.id })),
      });
    }

    const locationIds = formData.getAll("locationIds").map((value) => value.toString());
    const validLocations = locationIds.length
      ? await tx.location.findMany({
          where: { id: { in: locationIds }, tenantId: tenant.id },
          select: { id: true },
        })
      : [];
    if (validLocations.length > 0) {
      await tx.professionalLocation.createMany({
        data: validLocations.map((location) => ({ professionalId: created.id, locationId: location.id })),
      });
    }

    return created;
  });

  revalidatePath(`/dashboard/${tenantSlug}/professionals`);
  redirect(`/dashboard/${tenantSlug}/professionals/${professional.id}`);
}

export async function updateProfessionalAction(
  tenantSlug: string,
  professionalId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireProfessionalsManageAccess(tenantSlug);

  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
  });
  if (!professional) notFound();

  const { name, bio, commissionRate, active } = parseProfessionalFields(formData);
  const fieldError = validateProfessionalFields(name, commissionRate);
  if (fieldError) {
    redirect(
      `/dashboard/${tenantSlug}/professionals/${professionalId}?error=${encodeURIComponent(fieldError)}`
    );
  }

  // Igual que al crear: el tope nunca bloquea dejar/pasar al profesional a
  // inactivo. Si queda activo, se cuenta excluyendo a este profesional.
  if (active) {
    const currentActiveCount = await prisma.professional.count({
      where: { tenantId: tenant.id, active: true, id: { not: professional.id } },
    });
    if (hasReachedProfessionalLimit(tenant.plan, currentActiveCount)) {
      const { maxProfessionals } = getPlanLimits(tenant.plan);
      redirect(
        `/dashboard/${tenantSlug}/professionals/${professionalId}?error=${encodeURIComponent(
          professionalLimitError(tenant.plan, maxProfessionals)
        )}`
      );
    }
  }

  await prisma.professional.update({
    where: { id: professional.id },
    data: { name, bio, commissionRate, active },
  });

  await applyProfessionalServicesUpdate(tenant.id, professional.id, formData);
  await applyProfessionalLocationsUpdate(tenant.id, professional.id, formData);

  revalidatePath(`/dashboard/${tenantSlug}/professionals/${professionalId}`);
  revalidatePath(`/dashboard/${tenantSlug}/professionals`);
  redirect(`/dashboard/${tenantSlug}/professionals/${professionalId}?saved=1`);
}

// Invita a un usuario nuevo con login propio, vinculado 1:1 a este
// profesional. El rol de cada StaffLocationRole creado es siempre
// PROFESSIONAL (nunca se elige a mano acá) — una por cada sede que el
// profesional ya tenga asignada.
export async function inviteProfessionalAsUserAction(
  tenantSlug: string,
  professionalId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireProfessionalsManageAccess(tenantSlug);

  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
    include: { professionalLocations: true },
  });
  if (!professional) notFound();

  const detailPath = `/dashboard/${tenantSlug}/professionals/${professionalId}`;

  if (professional.userId) {
    redirect(`${detailPath}?error=${encodeURIComponent("Este profesional ya tiene un usuario vinculado.")}`);
  }
  if (professional.professionalLocations.length === 0) {
    redirect(
      `${detailPath}?error=${encodeURIComponent(
        "Asigná al menos una sede a este profesional antes de darle acceso al dashboard."
      )}`
    );
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";

  if (!name || !email) {
    redirect(`${detailPath}?error=${encodeURIComponent("El nombre y el correo son obligatorios.")}`);
  }
  if (!EMAIL_FORMAT.test(email)) {
    redirect(`${detailPath}?error=${encodeURIComponent("El correo no tiene un formato válido.")}`);
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const message =
      existingUser.tenantId === tenant.id
        ? "Ese correo ya tiene una cuenta en tu equipo. Vinculalo desde \"usuario existente\" en vez de invitar de nuevo."
        : "Ese correo ya pertenece a otra cuenta y no se puede usar aquí.";
    redirect(`${detailPath}?error=${encodeURIComponent(message)}`);
  }

  const plainPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { tenantId: tenant.id, name, email, passwordHash },
      });
      await tx.staffLocationRole.createMany({
        data: professional.professionalLocations.map((professionalLocation) => ({
          userId: user.id,
          locationId: professionalLocation.locationId,
          role: "PROFESSIONAL",
        })),
      });
      await tx.professional.update({ where: { id: professional.id }, data: { userId: user.id } });
    });
  } catch (err) {
    // El chequeo de existingUser de arriba queda afuera de esta transacción —
    // ver el mismo comentario en team/actions.ts createTeamMemberAction.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      redirect(`${detailPath}?error=${encodeURIComponent("Ese correo ya tiene una cuenta — probá de nuevo.")}`);
    }
    throw err;
  }

  const cookieStore = await cookies();
  cookieStore.set(`newUserTempPassword_${professionalId}`, plainPassword, {
    httpOnly: true,
    maxAge: 60,
    path: "/dashboard",
  });

  revalidatePath(detailPath);
  redirect(`${detailPath}?invited=1`);
}

// Vincula este profesional a un usuario del equipo que YA existe. A
// diferencia de invitar, acá el usuario puede ya tener roles propios (por
// ejemplo, el OWNER vinculándose a sí mismo como único profesional en un
// plan INDIVIDUAL) — nunca se pisa un rol existente, solo se completan las
// sedes del profesional donde ese usuario todavía no tenga ningún acceso.
export async function linkExistingUserToProfessionalAction(
  tenantSlug: string,
  professionalId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireProfessionalsManageAccess(tenantSlug);

  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
    include: { professionalLocations: true },
  });
  if (!professional) notFound();

  const detailPath = `/dashboard/${tenantSlug}/professionals/${professionalId}`;

  if (professional.userId) {
    redirect(`${detailPath}?error=${encodeURIComponent("Este profesional ya tiene un usuario vinculado.")}`);
  }
  if (professional.professionalLocations.length === 0) {
    redirect(
      `${detailPath}?error=${encodeURIComponent(
        "Asigná al menos una sede a este profesional antes de darle acceso al dashboard."
      )}`
    );
  }

  const userId = formData.get("userId")?.toString() ?? "";
  const targetUser = await prisma.user.findFirst({
    where: { id: userId, tenantId: tenant.id },
    include: { professionalProfile: true },
  });
  if (!targetUser || targetUser.professionalProfile) {
    redirect(
      `${detailPath}?error=${encodeURIComponent("Elegí un usuario válido que todavía no esté vinculado a otro profesional.")}`
    );
  }

  const existingLocationIds = new Set(
    (
      await prisma.staffLocationRole.findMany({
        where: { userId, locationId: { in: professional.professionalLocations.map((pl) => pl.locationId) } },
        select: { locationId: true },
      })
    ).map((role) => role.locationId)
  );

  const missingLocationIds = professional.professionalLocations
    .map((pl) => pl.locationId)
    .filter((locationId) => !existingLocationIds.has(locationId));

  await prisma.$transaction([
    prisma.professional.update({ where: { id: professional.id }, data: { userId } }),
    ...missingLocationIds.map((locationId) =>
      prisma.staffLocationRole.create({ data: { userId, locationId, role: "PROFESSIONAL" } })
    ),
  ]);

  revalidatePath(detailPath);
  redirect(`${detailPath}?linked=1`);
}

// Rompe la asociación de identidad sin tocar el User ni sus
// StaffLocationRole — si además hay que revocarle el acceso al dashboard,
// eso se hace aparte desde Equipo.
export async function unlinkProfessionalUserAction(tenantSlug: string, professionalId: string): Promise<void> {
  const { tenant } = await requireProfessionalsManageAccess(tenantSlug);

  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
  });
  if (!professional) notFound();

  await prisma.professional.update({ where: { id: professional.id }, data: { userId: null } });

  const detailPath = `/dashboard/${tenantSlug}/professionals/${professionalId}`;
  revalidatePath(detailPath);
  redirect(`${detailPath}?unlinked=1`);
}
