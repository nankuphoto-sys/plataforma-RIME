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
    const totalServiceRevenue = professionalAppointments.reduce(
      (sum, appointment) => sum + Number(appointment.service.price),
      0
    );
    const commissionRatePercent = Number(professional.commissionRate);

    return {
      id: professional.id,
      name: professional.name,
      completedCount: professionalAppointments.length,
      totalServiceRevenue,
      commissionRatePercent,
      commissionAmount: calculateCommissionAmount(totalServiceRevenue, commissionRatePercent),
    };
  });

  return { statusCountsByStatus, revenueRows, commissionRows };
}
