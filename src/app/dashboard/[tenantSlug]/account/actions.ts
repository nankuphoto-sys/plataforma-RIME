"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";

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
