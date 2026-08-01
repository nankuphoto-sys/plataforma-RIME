"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireServicesManageAccess } from "@/lib/auth-guards";
import { planIncludesModule } from "@/lib/planLimits";

function parseServiceFields(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const durationMinutes = Number(formData.get("durationMinutes")?.toString() ?? "");
  const price = Number(formData.get("price")?.toString() ?? "");
  const active = formData.get("active") === "on";
  return { name, durationMinutes, price, active };
}

function validateServiceFields(name: string, durationMinutes: number, price: number): string | null {
  if (!name) return "El nombre es obligatorio.";
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return "La duración debe ser un número entero de minutos mayor a 0.";
  }
  if (Number.isNaN(price) || price < 0) {
    return "El precio debe ser un número mayor o igual a 0.";
  }
  return null;
}

export async function createServiceAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireServicesManageAccess(tenantSlug);

  const { name, durationMinutes, price, active } = parseServiceFields(formData);
  const fieldError = validateServiceFields(name, durationMinutes, price);
  if (fieldError) {
    redirect(`/dashboard/${tenantSlug}/services/new?error=${encodeURIComponent(fieldError)}`);
  }

  const service = await prisma.service.create({
    data: { tenantId: tenant.id, name, durationMinutes, price, active },
  });

  revalidatePath(`/dashboard/${tenantSlug}/services`);
  redirect(`/dashboard/${tenantSlug}/services/${service.id}`);
}

export async function updateServiceAction(
  tenantSlug: string,
  serviceId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireServicesManageAccess(tenantSlug);

  const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId: tenant.id } });
  if (!service) notFound();

  const { name, durationMinutes, price, active } = parseServiceFields(formData);
  const fieldError = validateServiceFields(name, durationMinutes, price);
  if (fieldError) {
    redirect(
      `/dashboard/${tenantSlug}/services/${serviceId}?error=${encodeURIComponent(fieldError)}`
    );
  }

  await prisma.service.update({
    where: { id: service.id },
    data: { name, durationMinutes, price, active },
  });

  revalidatePath(`/dashboard/${tenantSlug}/services/${serviceId}`);
  revalidatePath(`/dashboard/${tenantSlug}/services`);
  redirect(`/dashboard/${tenantSlug}/services/${serviceId}?saved=1`);
}

// Set-replace transaccional de ServiceInventoryItem para un servicio (mismo
// patrón que applyProfessionalServicesUpdate en professionals/actions.ts,
// más la cantidad por uso de cada insumo marcado). Gateado por el mismo
// guard que el resto de la página MÁS un chequeo explícito del módulo
// "inventory" — este vínculo hereda ese gating, no inventa uno nuevo.
export async function updateServiceInventoryItemsAction(
  tenantSlug: string,
  serviceId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireServicesManageAccess(tenantSlug);

  if (!planIncludesModule(tenant.plan, "inventory")) {
    redirect(`/dashboard/${tenantSlug}/plan-required?feature=inventario&requiredPlan=PREMIUM`);
  }

  const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId: tenant.id } });
  if (!service) notFound();

  const detailPath = `/dashboard/${tenantSlug}/services/${serviceId}`;

  const submittedItemIds = formData.getAll("itemIds").map((value) => value.toString());

  const validItems = submittedItemIds.length
    ? await prisma.inventoryItem.findMany({
        where: { id: { in: submittedItemIds }, tenantId: tenant.id, active: true },
        select: { id: true },
      })
    : [];
  const validItemIds = validItems.map((item) => item.id);

  const links: { itemId: string; quantityPerUse: number }[] = [];
  for (const itemId of validItemIds) {
    const quantityRaw = formData.get(`quantity_${itemId}`)?.toString().trim() ?? "";
    const quantityPerUse = Number.parseInt(quantityRaw, 10);
    if (!Number.isInteger(quantityPerUse) || quantityPerUse < 1) {
      redirect(
        `${detailPath}?error=${encodeURIComponent(
          "La cantidad por uso de cada insumo marcado debe ser un entero mayor o igual a 1."
        )}`
      );
    }
    links.push({ itemId, quantityPerUse });
  }

  await prisma.$transaction([
    prisma.serviceInventoryItem.deleteMany({
      where: { serviceId: service.id, itemId: { notIn: validItemIds } },
    }),
    ...links.map((link) =>
      prisma.serviceInventoryItem.upsert({
        where: { serviceId_itemId: { serviceId: service.id, itemId: link.itemId } },
        create: { serviceId: service.id, itemId: link.itemId, quantityPerUse: link.quantityPerUse },
        update: { quantityPerUse: link.quantityPerUse },
      })
    ),
  ]);

  revalidatePath(detailPath);
  redirect(`${detailPath}?saved=1`);
}
