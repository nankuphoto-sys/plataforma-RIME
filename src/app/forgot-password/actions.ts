"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  RESET_REQUEST_COOLDOWN_MINUTES,
  RESET_TOKEN_TTL_MINUTES,
  generateRawResetToken,
  hashResetToken,
} from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email";
import { getClientIp, isPasswordResetRateLimited, recordPasswordResetAttempt } from "@/lib/rateLimit";

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";

  // Rate-limit por IP, capa independiente del cooldown por usuario de más
  // abajo: frena a una sola IP probando muchos emails distintos (el cooldown
  // por usuario no ayuda ahí porque cada email es "la primera vez" para ese
  // usuario). Mensaje de error propio — a diferencia del resto de este flujo,
  // revelar "estás pidiendo demasiado rápido" no expone si un email existe o
  // no, así que no hace falta la respuesta genérica acá.
  const ip = await getClientIp();
  if (await isPasswordResetRateLimited(ip)) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "Demasiados intentos. Esperá unos minutos e intentá de nuevo."
      )}`
    );
  }
  await recordPasswordResetAttempt(ip);

  if (email && EMAIL_FORMAT.test(email)) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const cooldownStart = new Date(Date.now() - RESET_REQUEST_COOLDOWN_MINUTES * 60 * 1000);
      const recentToken = await prisma.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
          createdAt: { gt: cooldownStart },
        },
      });

      // Si ya hay un token reciente sin usar/vencer, no creamos otro ni
      // reenviamos el email — evita que alguien reviente el botón de submit
      // y sature el buzón. Sin importar esto, la respuesta al usuario es
      // siempre la misma (ver el redirect final, fuera de este if).
      if (!recentToken) {
        const rawToken = generateRawResetToken();
        const tokenHash = hashResetToken(rawToken);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

        await prisma.passwordResetToken.create({
          data: { userId: user.id, tokenHash, expiresAt },
        });

        const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;
        await sendPasswordResetEmail(email, resetUrl);
      }
    }
  }

  // Sin importar si el email existe o no, la respuesta es siempre la misma —
  // protección anti-enumeración, mismo cuidado que ya tiene el proyecto en
  // otros formularios (ej. signup).
  redirect("/forgot-password?sent=1");
}
