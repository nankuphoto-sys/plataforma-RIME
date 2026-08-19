"use server";

import crypto from "crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireTeamManageAccess } from "@/lib/auth-guards";

const ASSIGNABLE_ROLES = ["OWNER", "ADMIN", "STAFF", "PROFESSIONAL"] as const;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAssignableRole(value: string): value is Role {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

// Lee la tabla sede→rol enviada por el form (un <select name="role_<locationId>">
// por cada sede del tenant) y devuelve solo las filas con un rol distinto de
// "Sin acceso" (NONE, o cualquier valor que no matchee el enum Role).
function parseSubmittedLocationRoles(
  locations: { id: string }[],
  formData: FormData
): { locationId: string; role: Role }[] {
  const result: { locationId: string; role: Role }[] = [];
  for (const location of locations) {
    const value = formData.get(`role_${location.id}`)?.toString() ?? "";
    if (isAssignableRole(value)) {
      result.push({ locationId: location.id, role: value });
    }
  }
  return result;
}

// Regla anti-escalación de privilegios: un ADMIN (isOwner === false) no
// puede asignar el rol OWNER a nadie, ni editar a un usuario que ya tiene
// OWNER en alguna sede del tenant. Un OWNER no tiene restricción acá.
function findRoleEscalationError(
  isOwner: boolean,
  submittedRoles: { locationId: string; role: Role }[],
  targetAlreadyHasOwnerRole: boolean
): string | null {
  if (isOwner) return null;
  if (submittedRoles.some((entry) => entry.role === "OWNER")) {
    return "Solo un OWNER puede asignar el rol OWNER.";
  }
  if (targetAlreadyHasOwnerRole) {
    return "Solo un OWNER puede editar los accesos de otro OWNER.";
  }
  return null;
}

function generateTemporaryPassword(): string {
  // 9 bytes -> 12 caracteres base64url, generado con el módulo crypto de
  // Node (no Date.now() ni nada predecible).
  return crypto.randomBytes(9).toString("base64url");
}

// Set-replace transaccional de StaffLocationRole para un usuario, a partir
// de la tabla sede→rol enviada: borra las filas que ya no están en la lista
// y crea/actualiza el resto con el rol elegido (acá, a diferencia de
// applyLocationProfessionalsUpdate en locations/actions.ts, el rol también
// puede cambiar, no solo asignarse/desasignarse).
async function applyTeamMemberRolesUpdate(
  userId: string,
  submittedRoles: { locationId: string; role: Role }[]
): Promise<void> {
  const locationIds = submittedRoles.map((entry) => entry.locationId);

  await prisma.$transaction([
    prisma.staffLocationRole.deleteMany({
      where: { userId, locationId: { notIn: locationIds } },
    }),
    ...submittedRoles.map((entry) =>
      prisma.staffLocationRole.upsert({
        where: { userId_locationId: { userId, locationId: entry.locationId } },
        create: { userId, locationId: entry.locationId, role: entry.role },
        update: { role: entry.role },
      })
    ),
  ]);
}

export async function createTeamMemberAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant, isOwner } = await requireTeamManageAccess(tenantSlug);

  const name = formData.get("name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";

  if (!name || !email) {
    redirect(
      `/dashboard/${tenantSlug}/team/new?error=${encodeURIComponent("El nombre y el correo son obligatorios.")}`
    );
  }
  if (!EMAIL_FORMAT.test(email)) {
    redirect(
      `/dashboard/${tenantSlug}/team/new?error=${encodeURIComponent("El correo no tiene un formato válido.")}`
    );
  }

  const submittedRoles = parseSubmittedLocationRoles(tenant.locations, formData);

  const escalationError = findRoleEscalationError(isOwner, submittedRoles, false);
  if (escalationError) {
    redirect(`/dashboard/${tenantSlug}/team/new?error=${encodeURIComponent(escalationError)}`);
  }

  if (submittedRoles.length === 0) {
    redirect(
      `/dashboard/${tenantSlug}/team/new?error=${encodeURIComponent(
        "Selecciona al menos un rol de acceso para alguna sede."
      )}`
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const message =
      existingUser.tenantId === tenant.id
        ? "Ese correo ya tiene una cuenta en tu equipo. Edítalo desde la lista."
        : "Ese correo ya pertenece a otra cuenta y no se puede usar aquí.";
    redirect(`/dashboard/${tenantSlug}/team/new?error=${encodeURIComponent(message)}`);
  }

  const plainPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { tenantId: tenant.id, name, email, passwordHash },
      });
      await tx.staffLocationRole.createMany({
        data: submittedRoles.map((entry) => ({
          userId: created.id,
          locationId: entry.locationId,
          role: entry.role,
        })),
      });
      return created;
    });
  } catch (err) {
    // El chequeo de existingUser de arriba queda afuera de esta transacción —
    // dos invitaciones concurrentes al mismo correo (dos admins, o un doble
    // click) podrían pasar ambas ese chequeo antes de que cualquiera escriba,
    // y la segunda rompía el @unique de User.email sin capturarse, mostrando
    // la pantalla de error genérica en vez de un mensaje entendible.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      redirect(
        `/dashboard/${tenantSlug}/team/new?error=${encodeURIComponent(
          "Ese correo ya tiene una cuenta — prueba de nuevo o edítalo desde la lista."
        )}`
      );
    }
    throw err;
  }

  // httpOnly + maxAge corto: es la única vez que la contraseña en texto
  // plano existe fuera de su hash — nunca en la URL/query param (quedaría en
  // el historial del navegador y en logs).
  const cookieStore = await cookies();
  cookieStore.set(`newUserTempPassword_${user.id}`, plainPassword, {
    httpOnly: true,
    maxAge: 60,
    path: "/dashboard",
  });

  revalidatePath(`/dashboard/${tenantSlug}/team`);
  redirect(`/dashboard/${tenantSlug}/team/${user.id}?created=1`);
}

export async function updateTeamMemberAction(
  tenantSlug: string,
  userId: string,
  formData: FormData
): Promise<void> {
  const { session, tenant, isOwner } = await requireTeamManageAccess(tenantSlug);

  const targetUser = await prisma.user.findFirst({ where: { id: userId, tenantId: tenant.id } });
  if (!targetUser) notFound();

  const submittedRoles = parseSubmittedLocationRoles(tenant.locations, formData);

  const targetAlreadyHasOwnerRole = await prisma.staffLocationRole.findFirst({
    where: { userId, role: "OWNER", location: { tenantId: tenant.id } },
  });

  const escalationError = findRoleEscalationError(isOwner, submittedRoles, Boolean(targetAlreadyHasOwnerRole));
  if (escalationError) {
    redirect(`/dashboard/${tenantSlug}/team/${userId}?error=${encodeURIComponent(escalationError)}`);
  }

  if (userId === session.user.id && submittedRoles.length === 0) {
    redirect(
      `/dashboard/${tenantSlug}/team/${userId}?error=${encodeURIComponent(
        "No puedes quitarte a ti mismo todo tu acceso."
      )}`
    );
  }

  // Si el usuario editado tiene OWNER hoy y el form ya no le asigna OWNER en
  // ninguna sede, hay que asegurarse de que quede al menos otro OWNER en el
  // tenant — si no, nadie podría volver a otorgar el rol OWNER nunca más
  // (findRoleEscalationError le prohíbe asignarlo a cualquiera que no sea ya
  // OWNER), dejando billing/settings/locations permanentemente inaccesibles.
  const willLoseOwnerRole =
    Boolean(targetAlreadyHasOwnerRole) && !submittedRoles.some((entry) => entry.role === "OWNER");
  if (willLoseOwnerRole) {
    const otherOwnerCount = await prisma.staffLocationRole.count({
      where: { role: "OWNER", location: { tenantId: tenant.id }, userId: { not: userId } },
    });
    if (otherOwnerCount === 0) {
      redirect(
        `/dashboard/${tenantSlug}/team/${userId}?error=${encodeURIComponent(
          "No se puede quitar el rol OWNER: es el único OWNER del negocio. Asigna OWNER a otra persona primero."
        )}`
      );
    }
  }

  await applyTeamMemberRolesUpdate(userId, submittedRoles);

  revalidatePath(`/dashboard/${tenantSlug}/team/${userId}`);
  revalidatePath(`/dashboard/${tenantSlug}/team`);
  redirect(`/dashboard/${tenantSlug}/team/${userId}?saved=1`);
}

// Reseteo de contraseña asistido por OWNER/ADMIN: cubre el caso de un
// teammate cuyo email esté mal cargado o inaccesible, como complemento
// (no reemplazo) del flujo self-service por email de /forgot-password.
export async function resetTeamMemberPasswordAction(tenantSlug: string, userId: string): Promise<void> {
  const { tenant, isOwner } = await requireTeamManageAccess(tenantSlug);

  const targetUser = await prisma.user.findFirst({ where: { id: userId, tenantId: tenant.id } });
  if (!targetUser) notFound();

  // Misma regla anti-escalación que ya existe: un ADMIN no puede resetear la
  // contraseña de un usuario que tiene rol OWNER en alguna sede del tenant.
  const targetAlreadyHasOwnerRole = await prisma.staffLocationRole.findFirst({
    where: { userId, role: "OWNER", location: { tenantId: tenant.id } },
  });
  const escalationError = findRoleEscalationError(isOwner, [], Boolean(targetAlreadyHasOwnerRole));
  if (escalationError) {
    redirect(`/dashboard/${tenantSlug}/team/${userId}?error=${encodeURIComponent(escalationError)}`);
  }

  const plainPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  // Misma cookie httpOnly de maxAge corto que ya usa createTeamMemberAction —
  // es la única vez que la contraseña en texto plano existe fuera de su hash.
  const cookieStore = await cookies();
  cookieStore.set(`newUserTempPassword_${userId}`, plainPassword, {
    httpOnly: true,
    maxAge: 60,
    path: "/dashboard",
  });

  redirect(`/dashboard/${tenantSlug}/team/${userId}?resetPw=1`);
}
