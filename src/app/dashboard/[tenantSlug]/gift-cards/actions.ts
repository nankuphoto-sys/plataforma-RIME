"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireGiftCardsManageAccess } from "@/lib/auth-guards";

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1, para que no se confundan al copiar a mano

function generateCodeGroup(length: number): string {
  let group = "";
  for (let i = 0; i < length; i++) {
    group += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return group;
}

async function generateUniqueCode(tenantId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `RIME-${generateCodeGroup(4)}-${generateCodeGroup(4)}`;
    const existing = await prisma.giftCard.findUnique({ where: { tenantId_code: { tenantId, code } } });
    if (!existing) return code;
  }
  throw new Error("No se pudo generar un código único para la gift card.");
}

export async function createGiftCardAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant, session } = await requireGiftCardsManageAccess(tenantSlug);

  const rawAmount = formData.get("initialAmount")?.toString() ?? "";
  const amount = Number(rawAmount);
  const recipientName = formData.get("recipientName")?.toString().trim() || null;
  const purchaserName = formData.get("purchaserName")?.toString().trim() || null;
  const purchaserContact = formData.get("purchaserContact")?.toString().trim() || null;
  const note = formData.get("note")?.toString().trim() || null;
  const rawExpiresAt = formData.get("expiresAt")?.toString() ?? "";

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(
      `/dashboard/${tenantSlug}/gift-cards/new?error=${encodeURIComponent("Ingresá un monto mayor a 0.")}`
    );
  }

  const code = await generateUniqueCode(tenant.id);

  const giftCard = await prisma.giftCard.create({
    data: {
      tenantId: tenant.id,
      code,
      initialAmount: amount,
      balance: amount,
      recipientName,
      purchaserName,
      purchaserContact,
      note,
      expiresAt: rawExpiresAt ? new Date(rawExpiresAt) : null,
      createdByUserId: session.user.id,
    },
  });

  revalidatePath(`/dashboard/${tenantSlug}/gift-cards`);
  redirect(`/dashboard/${tenantSlug}/gift-cards/${giftCard.id}`);
}

export async function cancelGiftCardAction(tenantSlug: string, giftCardId: string): Promise<void> {
  const { tenant } = await requireGiftCardsManageAccess(tenantSlug);

  const giftCard = await prisma.giftCard.findFirst({ where: { id: giftCardId, tenantId: tenant.id } });
  if (!giftCard) notFound();

  if (giftCard.status !== "ACTIVE") {
    redirect(
      `/dashboard/${tenantSlug}/gift-cards/${giftCardId}?error=${encodeURIComponent("Solo se pueden anular gift cards activas.")}`
    );
  }

  await prisma.giftCard.update({ where: { id: giftCard.id }, data: { status: "CANCELLED" } });

  revalidatePath(`/dashboard/${tenantSlug}/gift-cards/${giftCardId}`);
  redirect(`/dashboard/${tenantSlug}/gift-cards/${giftCardId}?saved=1`);
}
