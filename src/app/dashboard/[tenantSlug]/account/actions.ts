"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
import {
  ALLOWED_PROFILE_IMAGE_TYPES,
  MAX_PROFILE_IMAGE_BYTES,
  MAX_PROFILE_IMAGE_LABEL,
} from "@/lib/profileImage";

// Sin servicio de almacenamiento de archivos en el proyecto (sin S3/Vercel
// Blob/Cloudinary configurado todavía) — se guarda como data URI en
// `User.image` (campo ya existente en el schema, heredado del adapter de
// Auth.js para providers OAuth, sin uso hasta ahora). Válido para una foto de
// perfil chica; si el proyecto necesita fotos más pesadas o servidas por CDN
// más adelante, ahí sí conviene sumar un servicio de blobs real.
export async function updateProfilePhotoAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { session } = await requireDashboardAccess(tenantSlug);

  const file = formData.get("profileImage");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `/dashboard/${tenantSlug}/account?photoError=${encodeURIComponent("Elige una imagen para subir.")}`
    );
  }

  if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
    redirect(
      `/dashboard/${tenantSlug}/account?photoError=${encodeURIComponent(
        "Formato no soportado. Usa JPG, PNG o WEBP."
      )}`
    );
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    redirect(
      `/dashboard/${tenantSlug}/account?photoError=${encodeURIComponent(
        `La imagen no puede pesar más de ${MAX_PROFILE_IMAGE_LABEL}.`
      )}`
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: dataUrl },
  });

  redirect(`/dashboard/${tenantSlug}/account?savedPhoto=1`);
}

export async function removeProfilePhotoAction(tenantSlug: string): Promise<void> {
  const { session } = await requireDashboardAccess(tenantSlug);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: null },
  });

  redirect(`/dashboard/${tenantSlug}/account?savedPhoto=1`);
}

export async function changePasswordAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { session } = await requireDashboardAccess(tenantSlug);

  const currentPassword = formData.get("currentPassword")?.toString() ?? "";
  const newPassword = formData.get("newPassword")?.toString() ?? "";
  const newPasswordConfirmation = formData.get("newPasswordConfirmation")?.toString() ?? "";

  // La sesión JWT no trae el hash — hay que ir a buscar el User completo.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const currentPasswordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentPasswordMatches) {
    redirect(
      `/dashboard/${tenantSlug}/account?error=${encodeURIComponent("La contraseña actual no es correcta.")}`
    );
  }

  if (newPassword.length < 8) {
    redirect(
      `/dashboard/${tenantSlug}/account?error=${encodeURIComponent(
        "La nueva contraseña debe tener al menos 8 caracteres."
      )}`
    );
  }
  if (newPassword !== newPasswordConfirmation) {
    redirect(
      `/dashboard/${tenantSlug}/account?error=${encodeURIComponent("Las contraseñas no coinciden.")}`
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    // Si tenía un link de recuperación por email sin usar dando vueltas, que
    // muera al cambiar la contraseña por este otro camino.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect(`/dashboard/${tenantSlug}/account?saved=1`);
}
