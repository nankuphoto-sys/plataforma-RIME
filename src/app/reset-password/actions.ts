"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashResetToken } from "@/lib/passwordReset";

export async function resetPasswordAction(token: string, formData: FormData): Promise<void> {
  const password = formData.get("password")?.toString() ?? "";
  const passwordConfirmation = formData.get("passwordConfirmation")?.toString() ?? "";

  if (password.length < 8) {
    redirect(
      `/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(
        "La contraseña debe tener al menos 8 caracteres."
      )}`
    );
  }
  if (password !== passwordConfirmation) {
    redirect(
      `/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(
        "Las contraseñas no coinciden."
      )}`
    );
  }

  const tokenHash = hashResetToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  const isInvalid =
    !resetToken || resetToken.usedAt !== null || resetToken.expiresAt < new Date();

  // Mensaje genérico sin importar cuál de los tres motivos fue (no existe,
  // ya usado, o vencido) — no revela detalles del estado interno del token.
  if (isInvalid) {
    redirect(
      `/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(
        "token-invalido"
      )}`
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken!.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken!.id },
      data: { usedAt: new Date() },
    }),
    // Si el usuario pidió el link dos veces, el primero muere al usar el
    // segundo, y viceversa.
    prisma.passwordResetToken.updateMany({
      where: { userId: resetToken!.userId, usedAt: null, id: { not: resetToken!.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect("/login?reset=success");
}
