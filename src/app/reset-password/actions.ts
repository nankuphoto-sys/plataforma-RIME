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

  // Reclamo atómico del token (usedAt: null en el where, no un update por id)
  // ANTES de tocar la contraseña: sin esto, un doble submit del mismo token
  // (doble click, dos pestañas con el mismo link) podría pasar el chequeo de
  // arriba en ambos requests antes de que cualquiera escriba, y el segundo
  // terminaría fijando la contraseña con lo que sea que tenía ese formulario,
  // pisando en silencio lo que el usuario ya había guardado con el primero.
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.passwordResetToken.updateMany({
      where: { id: resetToken!.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) return false;

    await tx.user.update({
      where: { id: resetToken!.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    // Si el usuario pidió el link dos veces, el primero muere al usar el
    // segundo, y viceversa.
    await tx.passwordResetToken.updateMany({
      where: { userId: resetToken!.userId, usedAt: null, id: { not: resetToken!.id } },
      data: { usedAt: new Date() },
    });

    return true;
  });

  if (!claimed) {
    redirect(
      `/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent("token-invalido")}`
    );
  }

  redirect("/login?reset=success");
}
