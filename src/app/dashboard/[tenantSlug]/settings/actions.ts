"use server";

import { redirect } from "next/navigation";
import type { DepositPolicy, DepositType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSettingsAccess } from "@/lib/auth-guards";

const VALID_POLICIES: readonly DepositPolicy[] = ["NONE", "DEPOSIT", "FULL_PAYMENT"];
const VALID_TYPES: readonly DepositType[] = ["PERCENTAGE", "FIXED"];

export async function updateDepositPolicyAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireSettingsAccess(tenantSlug);

  const policy = formData.get("depositPolicy")?.toString() as DepositPolicy | undefined;
  if (!policy || !VALID_POLICIES.includes(policy)) {
    redirect(`/dashboard/${tenantSlug}/settings?error=${encodeURIComponent("Política inválida.")}`);
  }

  if (policy !== "DEPOSIT") {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { depositPolicy: policy, depositType: null, depositValue: null },
    });
    redirect(`/dashboard/${tenantSlug}/settings?saved=1`);
  }

  const type = formData.get("depositType")?.toString() as DepositType | undefined;
  const rawValue = formData.get("depositValue")?.toString() ?? "";
  const value = Number(rawValue);

  if (!type || !VALID_TYPES.includes(type)) {
    redirect(`/dashboard/${tenantSlug}/settings?error=${encodeURIComponent("Elegí porcentaje o monto fijo.")}`);
  }

  if (!Number.isFinite(value) || value <= 0) {
    redirect(`/dashboard/${tenantSlug}/settings?error=${encodeURIComponent("Ingresá un monto de seña mayor a 0.")}`);
  }

  if (type === "PERCENTAGE" && (value < 1 || value > 100)) {
    redirect(`/dashboard/${tenantSlug}/settings?error=${encodeURIComponent("El porcentaje debe estar entre 1 y 100.")}`);
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { depositPolicy: "DEPOSIT", depositType: type, depositValue: value },
  });

  redirect(`/dashboard/${tenantSlug}/settings?saved=1`);
}

export async function updateLoyaltyPolicyAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireSettingsAccess(tenantSlug);

  const enabled = formData.get("loyaltyEnabled") === "on";
  const rawStampsRequired = formData.get("loyaltyStampsRequired")?.toString() ?? "";
  const stampsRequired = Number(rawStampsRequired);
  const rewardDescription = formData.get("loyaltyRewardDescription")?.toString().trim() ?? "";

  if (enabled) {
    if (!Number.isInteger(stampsRequired) || stampsRequired < 1) {
      redirect(
        `/dashboard/${tenantSlug}/settings?loyaltyError=${encodeURIComponent(
          "La cantidad de sellos debe ser un número entero mayor a 0."
        )}`
      );
    }
    if (!rewardDescription) {
      redirect(
        `/dashboard/${tenantSlug}/settings?loyaltyError=${encodeURIComponent("Describí el premio.")}`
      );
    }
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      loyaltyEnabled: enabled,
      // Se guardan igual aunque enabled sea false, para no perder la
      // configuración si el negocio la desactiva y la vuelve a activar.
      loyaltyStampsRequired: Number.isInteger(stampsRequired) && stampsRequired >= 1 ? stampsRequired : tenant.loyaltyStampsRequired,
      loyaltyRewardDescription: rewardDescription || tenant.loyaltyRewardDescription,
    },
  });

  redirect(`/dashboard/${tenantSlug}/settings?loyaltySaved=1`);
}

const MAX_MARKETPLACE_DESCRIPTION_LENGTH = 160;

export async function updateMarketplaceListingAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireSettingsAccess(tenantSlug);

  const listed = formData.get("marketplaceListed") === "on";
  const description = formData.get("marketplaceDescription")?.toString().trim() ?? "";

  if (description.length > MAX_MARKETPLACE_DESCRIPTION_LENGTH) {
    redirect(
      `/dashboard/${tenantSlug}/settings?marketplaceError=${encodeURIComponent(
        `La descripción no puede superar los ${MAX_MARKETPLACE_DESCRIPTION_LENGTH} caracteres.`
      )}`
    );
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      marketplaceListed: listed,
      marketplaceDescription: description || null,
    },
  });

  redirect(`/dashboard/${tenantSlug}/settings?marketplaceSaved=1`);
}
