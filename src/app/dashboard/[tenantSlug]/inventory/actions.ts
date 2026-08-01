"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInventoryAccess, requireInventoryManageAccess } from "@/lib/auth-guards";
import { hasLocationAccess } from "@/lib/authorization";

function parseItemFields(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const unit = formData.get("unit")?.toString().trim() ?? "";
  const lowStockThresholdRaw = formData.get("lowStockThreshold")?.toString().trim() ?? "0";
  const lowStockThreshold = Number.parseInt(lowStockThresholdRaw, 10);
  return { name, unit, lowStockThreshold };
}

export async function createInventoryItemAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireInventoryManageAccess(tenantSlug);

  const { name, unit, lowStockThreshold } = parseItemFields(formData);
  if (!name || !unit) {
    redirect(
      `/dashboard/${tenantSlug}/inventory/new?error=${encodeURIComponent("Nombre y unidad son obligatorios.")}`
    );
  }
  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
    redirect(
      `/dashboard/${tenantSlug}/inventory/new?error=${encodeURIComponent("El umbral de stock bajo debe ser un número mayor o igual a 0.")}`
    );
  }

  const item = await prisma.inventoryItem.create({
    data: { tenantId: tenant.id, name, unit, lowStockThreshold },
  });

  revalidatePath(`/dashboard/${tenantSlug}/inventory`);
  redirect(`/dashboard/${tenantSlug}/inventory/${item.id}`);
}

export async function updateInventoryItemAction(
  tenantSlug: string,
  itemId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireInventoryManageAccess(tenantSlug);

  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, tenantId: tenant.id } });
  if (!item) notFound();

  const { name, unit, lowStockThreshold } = parseItemFields(formData);
  const active = formData.get("active") === "on";

  if (!name || !unit) {
    redirect(
      `/dashboard/${tenantSlug}/inventory/${itemId}?error=${encodeURIComponent("Nombre y unidad son obligatorios.")}`
    );
  }
  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
    redirect(
      `/dashboard/${tenantSlug}/inventory/${itemId}?error=${encodeURIComponent("El umbral de stock bajo debe ser un número mayor o igual a 0.")}`
    );
  }

  await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { name, unit, lowStockThreshold, active },
  });

  revalidatePath(`/dashboard/${tenantSlug}/inventory/${itemId}`);
  revalidatePath(`/dashboard/${tenantSlug}/inventory`);
  redirect(`/dashboard/${tenantSlug}/inventory/${itemId}?saved=1`);
}

// Accesible a cualquiera con acceso a la sede indicada (hasLocationAccess),
// no solo OWNER/ADMIN — un STAFF de recepción debe poder registrar consumos.
export async function recordInventoryMovementAction(
  tenantSlug: string,
  itemId: string,
  formData: FormData
): Promise<void> {
  const { session, tenant } = await requireInventoryAccess(tenantSlug);

  const locationId = formData.get("locationId")?.toString() ?? "";
  const type = formData.get("type")?.toString();
  const quantityRaw = formData.get("quantity")?.toString().trim() ?? "";
  const note = formData.get("note")?.toString().trim() || null;
  const quantity = Number.parseInt(quantityRaw, 10);

  const redirectWithError = (error: string) => {
    redirect(
      `/dashboard/${tenantSlug}/inventory/${itemId}?locationId=${locationId}&error=${encodeURIComponent(error)}`
    );
  };

  if (type !== "IN" && type !== "OUT") {
    redirectWithError("Tipo de movimiento inválido.");
    return;
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirectWithError("La cantidad debe ser un número mayor a 0.");
    return;
  }

  // Nunca confiar en los ids que llegan del formulario: validamos que el
  // ítem y la sede pertenezcan al tenant, y que el usuario tenga acceso a
  // esa sede puntual.
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, tenantId: tenant.id } });
  if (!item) notFound();

  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: tenant.id } });
  if (!location) {
    redirectWithError("Sede no válida.");
    return;
  }
  if (!hasLocationAccess(session.user.locationRoles, location.id)) {
    redirectWithError("No tienes acceso a esa sede.");
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.findUnique({
        where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
      });
      const currentQuantity = stock?.quantity ?? 0;

      if (type === "OUT" && quantity > currentQuantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const nextQuantity = type === "IN" ? currentQuantity + quantity : currentQuantity - quantity;

      await tx.inventoryStock.upsert({
        where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
        create: { itemId: item.id, locationId: location.id, quantity: nextQuantity },
        update: { quantity: nextQuantity },
      });

      await tx.inventoryMovement.create({
        data: {
          itemId: item.id,
          locationId: location.id,
          type,
          quantity,
          note,
          createdByUserId: session.user.id,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_STOCK") {
      redirectWithError("No hay stock suficiente para registrar esta salida.");
      return;
    }
    throw err;
  }

  revalidatePath(`/dashboard/${tenantSlug}/inventory/${itemId}`);
  revalidatePath(`/dashboard/${tenantSlug}/inventory`);
  redirect(`/dashboard/${tenantSlug}/inventory/${itemId}?locationId=${locationId}&saved=1`);
}
