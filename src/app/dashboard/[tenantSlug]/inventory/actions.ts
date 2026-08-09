"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInventoryAccess, requireInventoryManageAccess } from "@/lib/auth-guards";
import { hasLocationAccess } from "@/lib/authorization";
import { crossedLowStockThreshold, maybeSendLowStockAlerts } from "@/lib/inventory";
import { normalizePhoneForWhatsapp } from "@/lib/whatsapp";

function parseItemFields(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const unit = formData.get("unit")?.toString().trim() ?? "";
  const lowStockThresholdRaw = formData.get("lowStockThreshold")?.toString().trim() ?? "0";
  const lowStockThreshold = Number.parseInt(lowStockThresholdRaw, 10);
  // Costo opcional: campo vacío = null (costo no cargado), distinto de "0".
  // No confundir con lowStockThreshold, que sí tiene un default numérico.
  const unitCostRaw = formData.get("unitCost")?.toString().trim() ?? "";
  const unitCost = unitCostRaw === "" ? null : Number(unitCostRaw);
  return { name, unit, lowStockThreshold, unitCost };
}

function validateItemCost(unitCost: number | null): string | null {
  if (unitCost !== null && (Number.isNaN(unitCost) || unitCost < 0)) {
    return "El costo debe ser un número mayor o igual a 0, o dejarse vacío.";
  }
  return null;
}

export async function createInventoryItemAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireInventoryManageAccess(tenantSlug);

  const { name, unit, lowStockThreshold, unitCost } = parseItemFields(formData);
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
  const costError = validateItemCost(unitCost);
  if (costError) {
    redirect(`/dashboard/${tenantSlug}/inventory/new?error=${encodeURIComponent(costError)}`);
  }

  const item = await prisma.inventoryItem.create({
    data: { tenantId: tenant.id, name, unit, lowStockThreshold, unitCost },
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

  const { name, unit, lowStockThreshold, unitCost } = parseItemFields(formData);
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
  const costError = validateItemCost(unitCost);
  if (costError) {
    redirect(`/dashboard/${tenantSlug}/inventory/${itemId}?error=${encodeURIComponent(costError)}`);
  }

  await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { name, unit, lowStockThreshold, unitCost, active },
  });

  revalidatePath(`/dashboard/${tenantSlug}/inventory/${itemId}`);
  revalidatePath(`/dashboard/${tenantSlug}/inventory`);
  redirect(`/dashboard/${tenantSlug}/inventory/${itemId}?saved=1`);
}

// Configura (o desactiva, con campo vacío) el número al que se avisa por
// WhatsApp cuando un insumo cruza su umbral de stock bajo — ver
// Tenant.lowStockAlertPhone y src/lib/inventory.ts (maybeSendLowStockAlerts).
// Mismo guard que crear/editar ítems (OWNER/ADMIN) — es configuración del
// negocio, no una operación del día a día como registrar un movimiento.
export async function updateLowStockAlertPhoneAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireInventoryManageAccess(tenantSlug);

  const raw = formData.get("lowStockAlertPhone")?.toString().trim() ?? "";
  const redirectPath = `/dashboard/${tenantSlug}/inventory`;

  if (raw === "") {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { lowStockAlertPhone: null } });
    revalidatePath(redirectPath);
    redirect(`${redirectPath}?alertPhoneSaved=1`);
  }

  if (!normalizePhoneForWhatsapp(raw)) {
    redirect(`${redirectPath}?error=${encodeURIComponent("Ese número no parece válido. Dejalo vacío para desactivar las alertas.")}`);
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: { lowStockAlertPhone: raw } });

  revalidatePath(redirectPath);
  redirect(`${redirectPath}?alertPhoneSaved=1`);
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

  let crossedIntoLowStock = false;
  let nextQuantityForAlert = 0;

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

      // Solo una salida puede cruzar el umbral hacia abajo — una entrada
      // nunca dispara esta alerta (ver crossedLowStockThreshold).
      if (type === "OUT" && crossedLowStockThreshold(currentQuantity, nextQuantity, item.lowStockThreshold)) {
        crossedIntoLowStock = true;
        nextQuantityForAlert = nextQuantity;
      }
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

  // Fuera de la transacción a propósito, fire-and-forget — ver el comentario
  // equivalente en updateAppointmentStatusAction.
  if (crossedIntoLowStock) {
    void maybeSendLowStockAlerts([
      {
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        tenantId: tenant.id,
        locationId: location.id,
        newQuantity: nextQuantityForAlert,
      },
    ]);
  }

  redirect(`/dashboard/${tenantSlug}/inventory/${itemId}?locationId=${locationId}&saved=1`);
}
