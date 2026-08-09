import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneForWhatsapp, sendLowStockAlertWhatsAppMessage } from "@/lib/whatsapp";

// Un movimiento de salida "cruza" el umbral de stock bajo solo si el stock
// ANTES del movimiento estaba por encima del umbral y el de DESPUÉS quedó en
// el umbral o por debajo — así una seguidilla de salidas mientras el stock ya
// está bajo no dispara un WhatsApp por cada una, solo la primera que lo cruza
// de verdad. Pura, sin acceso a base de datos — fácil de testear.
export function crossedLowStockThreshold(
  previousQuantity: number,
  newQuantity: number,
  lowStockThreshold: number
): boolean {
  return previousQuantity > lowStockThreshold && newQuantity <= lowStockThreshold;
}

export interface LowStockAlertCandidate {
  itemId: string;
  itemName: string;
  unit: string;
  tenantId: string;
  locationId: string;
  newQuantity: number;
}

// Descuenta el stock de los insumos vinculados a un servicio cuando una cita
// de ese servicio se marca COMPLETED. Pensada para correr dentro de una
// transacción ya abierta por quien la llama (updateAppointmentStatusAction)
// — por atomicidad con el cambio de estado de la cita, no por bloqueo: esta
// función NUNCA lanza por falta de stock, a diferencia de
// recordInventoryMovementAction (que sí rechaza un OUT manual que supere el
// stock actual). Un stock resultante negativo es el comportamiento esperado,
// no un error — decisión de producto ya tomada (ver prompt de esta fase).
//
// Devuelve los insumos cuya salida cruzó su umbral de stock bajo, para que
// quien llama (fuera de la transacción, después de que confirme) dispare la
// alerta de WhatsApp vía maybeSendLowStockAlerts — un envío de red nunca debe
// vivir dentro de una transacción de base de datos.
export async function deductInventoryForCompletedAppointment(
  tx: Prisma.TransactionClient,
  params: { serviceId: string; locationId: string; appointmentId: string; performedByUserId: string }
): Promise<LowStockAlertCandidate[]> {
  const links = await tx.serviceInventoryItem.findMany({
    where: { serviceId: params.serviceId },
    include: { item: true },
  });

  const crossedItems: LowStockAlertCandidate[] = [];

  for (const link of links) {
    const existingStock = await tx.inventoryStock.findUnique({
      where: { itemId_locationId: { itemId: link.itemId, locationId: params.locationId } },
    });
    const previousQuantity = existingStock?.quantity ?? 0;
    const newQuantity = previousQuantity - link.quantityPerUse;

    // decrement atómico: acá nunca bloqueamos, así que el upsert alcanza —
    // la lectura de arriba es solo para saber si cruzamos el umbral, no para
    // decidir si el movimiento procede (siempre procede).
    await tx.inventoryStock.upsert({
      where: { itemId_locationId: { itemId: link.itemId, locationId: params.locationId } },
      create: { itemId: link.itemId, locationId: params.locationId, quantity: -link.quantityPerUse },
      update: { quantity: { decrement: link.quantityPerUse } },
    });

    await tx.inventoryMovement.create({
      data: {
        itemId: link.itemId,
        locationId: params.locationId,
        type: "OUT",
        quantity: link.quantityPerUse,
        note: "Consumo automático — cita completada",
        appointmentId: params.appointmentId,
        createdByUserId: params.performedByUserId,
      },
    });

    if (crossedLowStockThreshold(previousQuantity, newQuantity, link.item.lowStockThreshold)) {
      crossedItems.push({
        itemId: link.itemId,
        itemName: link.item.name,
        unit: link.item.unit,
        tenantId: link.item.tenantId,
        locationId: params.locationId,
        newQuantity,
      });
    }
  }

  return crossedItems;
}

// Dispara (fire-and-forget, nunca lanza) la alerta de WhatsApp para cada
// insumo que cruzó su umbral, si el tenant tiene Tenant.lowStockAlertPhone
// configurado. Pensada para llamarse DESPUÉS de que la transacción que
// generó el/los movimiento(s) ya confirmó — nunca antes, para no mandar un
// aviso de un cambio que después se revierte. Silenciosa ante cualquier
// falla (sin token de Meta configurado, plantilla no aprobada, número
// inválido, etc.) — mismo criterio que el resto de los envíos de WhatsApp
// del proyecto (recordatorios, seguimiento de recompra): nunca bloquea ni
// revienta el flujo que la originó.
export async function maybeSendLowStockAlerts(candidates: LowStockAlertCandidate[]): Promise<void> {
  if (candidates.length === 0) return;

  // Los candidatos de una sola llamada (una cita, un registro manual)
  // siempre son del mismo tenant y la misma sede — una sola consulta alcanza.
  const { tenantId, locationId } = candidates[0];

  const [tenant, location] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { lowStockAlertPhone: true } }),
    prisma.location.findUnique({ where: { id: locationId }, select: { name: true } }),
  ]);

  const normalizedPhone = tenant?.lowStockAlertPhone
    ? normalizePhoneForWhatsapp(tenant.lowStockAlertPhone)
    : null;
  if (!normalizedPhone) return;

  for (const candidate of candidates) {
    await sendLowStockAlertWhatsAppMessage({
      to: normalizedPhone,
      itemName: candidate.itemName,
      currentStock: candidate.newQuantity,
      unit: candidate.unit,
      locationName: location?.name ?? "tu sede",
    });
  }
}
