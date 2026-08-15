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
  // Texto libre, igual que unit — campo vacío = null (sin categoría/proveedor
  // cargado), no un string vacío.
  const categoryRaw = formData.get("category")?.toString().trim() ?? "";
  const category = categoryRaw === "" ? null : categoryRaw;
  const supplierRaw = formData.get("supplier")?.toString().trim() ?? "";
  const supplier = supplierRaw === "" ? null : supplierRaw;
  const lowStockThresholdRaw = formData.get("lowStockThreshold")?.toString().trim() ?? "0";
  const lowStockThreshold = Number.parseInt(lowStockThresholdRaw, 10);
  // Costo opcional: campo vacío = null (costo no cargado), distinto de "0".
  // No confundir con lowStockThreshold, que sí tiene un default numérico.
  const unitCostRaw = formData.get("unitCost")?.toString().trim() ?? "";
  const unitCost = unitCostRaw === "" ? null : Number(unitCostRaw);
  return { name, unit, category, supplier, lowStockThreshold, unitCost };
}

function validateItemCost(unitCost: number | null): string | null {
  if (unitCost !== null && (Number.isNaN(unitCost) || unitCost < 0)) {
    return "El costo debe ser un número mayor o igual a 0, o dejarse vacío.";
  }
  return null;
}

export async function createInventoryItemAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireInventoryManageAccess(tenantSlug);

  const { name, unit, category, supplier, lowStockThreshold, unitCost } = parseItemFields(formData);
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
    data: { tenantId: tenant.id, name, unit, category, supplier, lowStockThreshold, unitCost },
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

  const { name, unit, category, supplier, lowStockThreshold, unitCost } = parseItemFields(formData);
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

  // Al desactivar (no al crear/editar sin cambiar el estado), desvincular
  // de los servicios que lo consumen — si no, deductInventoryForCompletedAppointment
  // seguiría descontando stock de un insumo que ya no se está gestionando.
  // No pasa lo mismo al reactivar: no reconstruimos vínculos borrados, el
  // usuario los vuelve a crear a mano desde Servicios si corresponde.
  const isDeactivating = item.active && !active;

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { name, unit, category, supplier, lowStockThreshold, unitCost, active },
    });
    if (isDeactivating) {
      await tx.serviceInventoryItem.deleteMany({ where: { itemId: item.id } });
    }
  });

  revalidatePath(`/dashboard/${tenantSlug}/inventory/${itemId}`);
  revalidatePath(`/dashboard/${tenantSlug}/inventory`);
  redirect(
    `/dashboard/${tenantSlug}/inventory/${itemId}?saved=1${isDeactivating ? "&unlinked=1" : ""}`
  );
}

// Configura (o desactiva, con campo vacío) el número al que se avisa por
// WhatsApp cuando un insumo cruza su umbral de stock bajo EN ESTA SEDE — ver
// Location.lowStockAlertPhone y src/lib/inventory.ts (maybeSendLowStockAlerts).
// Antes era un solo número por tenant; se movió a Location para que cada
// sede pueda avisarle a quien de verdad maneja su stock (ver el comentario
// en el schema y la migración que preserva el valor viejo). Mismo guard que
// crear/editar ítems (OWNER/ADMIN) — es configuración del negocio, no una
// operación del día a día como registrar un movimiento.
export async function updateLowStockAlertPhoneAction(
  tenantSlug: string,
  locationId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireInventoryManageAccess(tenantSlug);

  // No confiar en el id que llega del formulario: la sede tiene que ser de
  // este tenant.
  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: tenant.id } });
  if (!location) notFound();

  const raw = formData.get("lowStockAlertPhone")?.toString().trim() ?? "";
  const redirectPath = `/dashboard/${tenantSlug}/inventory?locationId=${locationId}`;

  if (raw === "") {
    await prisma.location.update({ where: { id: location.id }, data: { lowStockAlertPhone: null } });
    revalidatePath(redirectPath);
    redirect(`${redirectPath}&alertPhoneSaved=1`);
  }

  if (!normalizePhoneForWhatsapp(raw)) {
    redirect(`${redirectPath}&error=${encodeURIComponent("Ese número no parece válido. Dejalo vacío para desactivar las alertas.")}`);
  }

  await prisma.location.update({ where: { id: location.id }, data: { lowStockAlertPhone: raw } });

  revalidatePath(redirectPath);
  redirect(`${redirectPath}&alertPhoneSaved=1`);
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
        locationId: location.id,
        newQuantity: nextQuantityForAlert,
      },
    ]);
  }

  redirect(`/dashboard/${tenantSlug}/inventory/${itemId}?locationId=${locationId}&saved=1`);
}

// Borra un movimiento manual y revierte su efecto sobre InventoryStock, para
// que el stock quede consistente con lo que realmente queda registrado en el
// historial. Solo movimientos manuales (appointmentId null) — uno automático
// por cita completada es historial real de negocio, no un error de tipeo, y
// borrarlo dejaría el reporte de consumo (computeInventoryConsumption)
// inconsistente con Appointment.status. Mismo guard que editar el ítem
// (OWNER/ADMIN): registrar un movimiento es día a día y lo puede hacer
// cualquier STAFF con acceso a la sede, pero deshacer uno ya registrado es
// una corrección, no una operación de rutina.
export async function deleteInventoryMovementAction(
  tenantSlug: string,
  itemId: string,
  movementId: string
): Promise<void> {
  const { tenant } = await requireInventoryManageAccess(tenantSlug);

  const movement = await prisma.inventoryMovement.findFirst({
    where: { id: movementId, itemId, item: { tenantId: tenant.id } },
  });
  if (!movement) notFound();

  const redirectPath = `/dashboard/${tenantSlug}/inventory/${itemId}?locationId=${movement.locationId}`;

  if (movement.appointmentId !== null) {
    redirect(
      `${redirectPath}&error=${encodeURIComponent("Este movimiento es automático (de una cita completada) y no se puede borrar.")}`
    );
  }

  await prisma.$transaction(async (tx) => {
    const stock = await tx.inventoryStock.findUnique({
      where: { itemId_locationId: { itemId: movement.itemId, locationId: movement.locationId } },
    });
    const currentQuantity = stock?.quantity ?? 0;
    // Revertir: un IN sumó al registrarse, así que borrarlo resta; un OUT
    // restó, así que borrarlo suma de vuelta.
    const revertedQuantity =
      movement.type === "IN" ? currentQuantity - movement.quantity : currentQuantity + movement.quantity;

    await tx.inventoryStock.upsert({
      where: { itemId_locationId: { itemId: movement.itemId, locationId: movement.locationId } },
      create: { itemId: movement.itemId, locationId: movement.locationId, quantity: revertedQuantity },
      update: { quantity: revertedQuantity },
    });

    await tx.inventoryMovement.delete({ where: { id: movement.id } });
  });

  revalidatePath(`/dashboard/${tenantSlug}/inventory/${itemId}`);
  revalidatePath(`/dashboard/${tenantSlug}/inventory`);
  redirect(`${redirectPath}&movementDeleted=1`);
}

// Borra el ítem por completo — solo si nunca tuvo movimientos. Con historial
// real, la acción correcta es desactivarlo (checkbox "Activo" en editar),
// nunca borrarlo: este proyecto no destruye historial de negocio en ningún
// otro módulo (profesionales, servicios, sedes, equipo — todos usan `active`,
// ninguno borra), y un ítem con movimientos es exactamente ese caso. Un ítem
// sin movimientos, en cambio, no tiene nada que perder — probablemente se
// creó por error y nunca se usó. Cascade de Prisma (onDelete: Cascade en
// InventoryStock/ServiceInventoryItem/InventoryMovement) limpia lo demás.
export async function deleteInventoryItemAction(tenantSlug: string, itemId: string): Promise<void> {
  const { tenant } = await requireInventoryManageAccess(tenantSlug);

  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, tenantId: tenant.id },
    include: { _count: { select: { movements: true } } },
  });
  if (!item) notFound();

  if (item._count.movements > 0) {
    redirect(
      `/dashboard/${tenantSlug}/inventory/${itemId}?error=${encodeURIComponent(
        "Este ítem ya tiene movimientos registrados — no se puede borrar sin perder ese historial. Desactívalo en vez de borrarlo."
      )}`
    );
  }

  await prisma.inventoryItem.delete({ where: { id: item.id } });

  revalidatePath(`/dashboard/${tenantSlug}/inventory`);
  redirect(`/dashboard/${tenantSlug}/inventory?itemDeleted=1`);
}
