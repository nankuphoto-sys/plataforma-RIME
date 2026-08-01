import type { Prisma } from "@prisma/client";

// Descuenta el stock de los insumos vinculados a un servicio cuando una cita
// de ese servicio se marca COMPLETED. Pensada para correr dentro de una
// transacción ya abierta por quien la llama (updateAppointmentStatusAction)
// — por atomicidad con el cambio de estado de la cita, no por bloqueo: esta
// función NUNCA lanza por falta de stock, a diferencia de
// recordInventoryMovementAction (que sí rechaza un OUT manual que supere el
// stock actual). Un stock resultante negativo es el comportamiento esperado,
// no un error — decisión de producto ya tomada (ver prompt de esta fase).
export async function deductInventoryForCompletedAppointment(
  tx: Prisma.TransactionClient,
  params: { serviceId: string; locationId: string; appointmentId: string; performedByUserId: string }
): Promise<void> {
  const links = await tx.serviceInventoryItem.findMany({
    where: { serviceId: params.serviceId },
  });

  for (const link of links) {
    // decrement atómico, sin leer el stock actual primero: acá nunca
    // bloqueamos, así que no hace falta el read-then-check que sí usa el
    // registro manual, y el decrement es además más seguro ante concurrencia.
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
  }
}
