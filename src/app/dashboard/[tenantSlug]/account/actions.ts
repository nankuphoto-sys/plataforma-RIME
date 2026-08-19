"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess, requireOwnerAccess } from "@/lib/auth-guards";
import { decryptField, encryptField } from "@/lib/crypto";
import { tenantNameConfirmsDeletion } from "@/lib/accountDeletion";
import {
  buildTotpUri,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyTotpCode,
} from "@/lib/twoFactor";
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

// ------------------------------
// Eliminar cuenta (con período de gracia)
// ------------------------------
// Borra el historial completo de un negocio (clientes, fichas de salud,
// citas, pagos) — nunca un clic único e instantáneo. Pide escribir el
// nombre exacto del negocio, pasa el tenant a DELETION_REQUESTED, y el cron
// de src/app/api/cron/delete-requested-tenants/route.ts hace el borrado
// definitivo (cascade) pasados 30 días — tiempo de sobra para arrepentirse
// cancelando desde esta misma página.

export async function requestAccountDeletionAction(
  tenantSlug: string,
  confirmName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, tenant } = await requireOwnerAccess(tenantSlug);

  if (tenant.status === "DELETION_REQUESTED") {
    return { ok: false, error: "Ya solicitaste eliminar esta cuenta." };
  }

  if (!tenantNameConfirmsDeletion(confirmName, tenant.name)) {
    return { ok: false, error: "El nombre no coincide." };
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      status: "DELETION_REQUESTED",
      deletionRequestedAt: new Date(),
      deletionRequestedByEmail: session.user.email,
    },
  });

  revalidatePath(`/dashboard/${tenantSlug}/account`);
  return { ok: true };
}

export async function cancelAccountDeletionAction(
  tenantSlug: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { tenant } = await requireOwnerAccess(tenantSlug);

  if (tenant.status !== "DELETION_REQUESTED") {
    return { ok: false, error: "No hay ninguna eliminación pendiente para cancelar." };
  }

  // ACTIVE es el default seguro para "arrepentirse": el único otro status
  // desde el que se puede llegar a pedir la eliminación es TRIAL (PAST_DUE y
  // CANCELLED ya bloquean el dashboard entero antes de esta pantalla, ver
  // requireDashboardAccess) — el schema no guarda cuál era el status previo
  // exacto, así que un tenant en trial que cancela su baja queda en ACTIVE
  // en vez de volver a TRIAL. Aceptado a propósito (spec del dueño): más
  // simple que sumar un campo nuevo al schema solo para este caso borde.
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { status: "ACTIVE", deletionRequestedAt: null, deletionRequestedByEmail: null },
  });

  revalidatePath(`/dashboard/${tenantSlug}/account`);
  return { ok: true };
}

// ------------------------------
// Verificación en dos pasos (2FA por TOTP)
// ------------------------------
// Flujo en 2 pasos: startTwoFactorSetupAction genera un secreto y lo guarda
// cifrado (twoFactorEnabled sigue en false hasta confirmar), el usuario
// escanea el QR y confirma con confirmTwoFactorSetupAction, que recién ahí
// activa el 2FA y entrega los backup codes UNA sola vez (nunca más se
// pueden recuperar, solo se guarda su hash). disableTwoFactorAction pide un
// código vigente (TOTP o backup) antes de desactivar, para que no alcance
// con tener la sesión abierta en el navegador para apagar esta protección.

export async function startTwoFactorSetupAction(
  tenantSlug: string
): Promise<{ ok: true; qrCodeDataUrl: string; secret: string } | { ok: false; error: string }> {
  const { session } = await requireDashboardAccess(tenantSlug);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (user.twoFactorEnabled) {
    return { ok: false, error: "La verificación en dos pasos ya está activada." };
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: encryptField(secret) },
  });

  const qrCodeDataUrl = await QRCode.toDataURL(buildTotpUri(secret, user.email));

  return { ok: true, qrCodeDataUrl, secret };
}

export async function confirmTwoFactorSetupAction(
  tenantSlug: string,
  code: string
): Promise<{ ok: true; backupCodes: string[] } | { ok: false; error: string }> {
  const { session } = await requireDashboardAccess(tenantSlug);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.twoFactorSecret) {
    return { ok: false, error: "No hay una configuración de 2FA pendiente. Empieza de nuevo." };
  }

  const isValid = await verifyTotpCode(decryptField(user.twoFactorSecret), code);
  if (!isValid) {
    return { ok: false, error: "Código incorrecto. Revisa la hora de tu teléfono e intenta de nuevo." };
  }

  const backupCodes = generateBackupCodes();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorBackupCodes: JSON.stringify(backupCodes.map(hashBackupCode)),
    },
  });

  revalidatePath(`/dashboard/${tenantSlug}/account`);
  return { ok: true, backupCodes };
}

export async function disableTwoFactorAction(
  tenantSlug: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session } = await requireDashboardAccess(tenantSlug);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    return { ok: false, error: "La verificación en dos pasos no está activada." };
  }

  const isValidTotp = await verifyTotpCode(decryptField(user.twoFactorSecret), code);
  const hashedBackupCodes: string[] = user.twoFactorBackupCodes
    ? JSON.parse(user.twoFactorBackupCodes)
    : [];
  const isValidBackupCode = !isValidTotp && consumeBackupCode(code, hashedBackupCodes) !== null;

  if (!isValidTotp && !isValidBackupCode) {
    return { ok: false, error: "Código incorrecto." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null },
  });

  revalidatePath(`/dashboard/${tenantSlug}/account`);
  return { ok: true };
}
