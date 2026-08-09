import type { AppointmentStatus } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

// Rango por defecto: el mes calendario actual (desde el día 1 a las 00:00
// hasta el instante actual del `now` pasado, en UTC — no compliques con
// timezone de sede acá, es solo el default del filtro, el usuario puede
// cambiar el rango).
export function getDefaultReportRange(now: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from, to: now };
}

// Convierte un string "yyyy-mm-dd" de un query param a Date (00:00 UTC), o
// null si no es válido/está vacío.
export function parseReportDateParam(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// totalServiceRevenue y commissionRate como number (ya convertidos desde
// Decimal por quien llama). Redondea a 2 decimales.
export function calculateCommissionAmount(
  totalServiceRevenue: number,
  commissionRatePercent: number
): number {
  return Math.round(totalServiceRevenue * (commissionRatePercent / 100) * 100) / 100;
}

export interface ReportData {
  statusCountsByStatus: Record<AppointmentStatus, number>;
  revenueRows: { provider: string; currency: string; total: number; count: number }[];
  commissionRows: {
    id: string;
    name: string;
    completedCount: number;
    totalServiceRevenue: number;
    commissionRatePercent: number;
    commissionAmount: number;
    // Split de commissionAmount según Appointment.commissionPaidAt — la suma
    // de ambos siempre da commissionAmount. paidCommissionAmount es lo que
    // ya se marcó pagado (markCommissionAsPaidAction), pendingCommissionAmount
    // lo que todavía no.
    paidCommissionAmount: number;
    pendingCommissionAmount: number;
  }[];
}

// Única fuente de verdad para los números de Reportes — la página, el
// export CSV y el export PDF llaman a esta misma función, así nunca pueden
// mostrar valores distintos entre sí. Extraído tal cual de la lógica que
// antes vivía inline en reports/page.tsx, sin cambiar el cálculo.
export async function computeReportData(
  tenantId: string,
  professionals: { id: string; name: string; commissionRate: Decimal | number }[],
  from: Date,
  to: Date
): Promise<ReportData> {
  const [statusCounts, paidPayments, completedAppointments] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["status"],
      where: { tenantId, startsAt: { gte: from, lte: to } },
      _count: true,
    }),
    // status: "PAID", ancladas a Appointment.startsAt (no a fecha de creación
    // ni de confirmación del pago) — mismo eje de tiempo que el resto del reporte.
    prisma.payment.findMany({
      where: {
        status: "PAID",
        appointment: { tenantId, startsAt: { gte: from, lte: to } },
      },
    }),
    // Base de la comisión: Service.price de citas COMPLETED, NUNCA Payment.amount
    // — así el cálculo funciona igual para negocios que cobran en efectivo.
    prisma.appointment.findMany({
      where: { tenantId, status: "COMPLETED", startsAt: { gte: from, lte: to } },
      include: { service: true },
    }),
  ]);

  const statusCountsByStatus: Record<AppointmentStatus, number> = {
    PENDING: 0,
    CONFIRMED: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    NO_SHOW: 0,
  };
  for (const group of statusCounts) {
    statusCountsByStatus[group.status] = group._count;
  }

  // Payment.currency varía por proveedor (usd para Stripe, COP para Wompi):
  // nunca se suman montos de distinta moneda en un solo número.
  const revenueByProviderCurrency = new Map<
    string,
    { provider: string; currency: string; total: number; count: number }
  >();
  for (const payment of paidPayments) {
    const key = `${payment.provider}:${payment.currency}`;
    const amount = Number(payment.amount);
    const existing = revenueByProviderCurrency.get(key);
    if (existing) {
      existing.total += amount;
      existing.count += 1;
    } else {
      revenueByProviderCurrency.set(key, {
        provider: payment.provider,
        currency: payment.currency,
        total: amount,
        count: 1,
      });
    }
  }
  const revenueRows = Array.from(revenueByProviderCurrency.values());

  const commissionRows = professionals.map((professional) => {
    const professionalAppointments = completedAppointments.filter(
      (appointment) => appointment.professionalId === professional.id
    );
    const defaultRatePercent = Number(professional.commissionRate);

    let totalServiceRevenue = 0;
    let commissionAmount = 0;
    let paidCommissionAmount = 0;

    for (const appointment of professionalAppointments) {
      const servicePrice = Number(appointment.service.price);
      // Service.commissionRate es un override opcional para ESTE servicio —
      // si está seteado, manda por sobre el % default del profesional (nunca
      // al revés). La gran mayoría de los servicios no tiene override, así
      // que en la práctica esto sigue dando el mismo resultado que antes.
      const effectiveRatePercent =
        appointment.service.commissionRate !== null
          ? Number(appointment.service.commissionRate)
          : defaultRatePercent;
      const appointmentCommission = calculateCommissionAmount(servicePrice, effectiveRatePercent);

      totalServiceRevenue += servicePrice;
      commissionAmount += appointmentCommission;
      if (appointment.commissionPaidAt) {
        paidCommissionAmount += appointmentCommission;
      }
    }

    // Redondeo final: cada término ya viene redondeado a centavos (ver
    // calculateCommissionAmount), pero sumar varios números de 2 decimales en
    // punto flotante puede dejar restos como 20.299999999999997.
    commissionAmount = Math.round(commissionAmount * 100) / 100;
    paidCommissionAmount = Math.round(paidCommissionAmount * 100) / 100;
    const pendingCommissionAmount = Math.round((commissionAmount - paidCommissionAmount) * 100) / 100;

    return {
      id: professional.id,
      name: professional.name,
      completedCount: professionalAppointments.length,
      totalServiceRevenue,
      commissionRatePercent: defaultRatePercent,
      commissionAmount,
      paidCommissionAmount,
      pendingCommissionAmount,
    };
  });

  return { statusCountsByStatus, revenueRows, commissionRows };
}

export interface InventoryConsumptionRow {
  itemId: string;
  itemName: string;
  unit: string;
  automaticQuantity: number;
  manualOutQuantity: number;
  totalQuantity: number;
  unitCost: number | null;
  // null si unitCost es null (costo no cargado) — nunca se asume 0, para no
  // mostrar un total de $0 que en realidad es "no sabemos".
  totalValue: number | null;
}

// Consumo de insumos (movimientos OUT) en un rango de fechas, para el tenant
// completo (todas las sedes) — mismo eje de tiempo que el resto de Reportes
// (InventoryMovement.createdAt, análogo a Appointment.startsAt ahí). Se
// distingue consumo automático (appointmentId seteado, ver
// deductInventoryForCompletedAppointment) de manual (registrado a mano vía
// recordInventoryMovementAction) — mismo criterio que ya usa la UI de
// Inventario para la etiqueta "Automático — cita completada".
export async function computeInventoryConsumption(
  tenantId: string,
  from: Date,
  to: Date
): Promise<InventoryConsumptionRow[]> {
  const outMovements = await prisma.inventoryMovement.findMany({
    where: {
      type: "OUT",
      createdAt: { gte: from, lte: to },
      item: { tenantId },
    },
    include: { item: true },
  });

  const rowsByItemId = new Map<string, InventoryConsumptionRow>();
  for (const movement of outMovements) {
    const existing = rowsByItemId.get(movement.itemId);
    const unitCost = movement.item.unitCost !== null ? Number(movement.item.unitCost) : null;
    const row =
      existing ??
      ({
        itemId: movement.itemId,
        itemName: movement.item.name,
        unit: movement.item.unit,
        automaticQuantity: 0,
        manualOutQuantity: 0,
        totalQuantity: 0,
        unitCost,
        totalValue: unitCost !== null ? 0 : null,
      } satisfies InventoryConsumptionRow);

    if (movement.appointmentId) row.automaticQuantity += movement.quantity;
    else row.manualOutQuantity += movement.quantity;
    row.totalQuantity += movement.quantity;
    if (row.totalValue !== null && unitCost !== null) {
      row.totalValue = Math.round((row.totalValue + movement.quantity * unitCost) * 100) / 100;
    }

    rowsByItemId.set(movement.itemId, row);
  }

  return Array.from(rowsByItemId.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
}
