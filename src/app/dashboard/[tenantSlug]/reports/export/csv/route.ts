import { NextResponse } from "next/server";
import { requireReportsAccess } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import {
  computeInventoryConsumption,
  computeReportData,
  getDefaultReportRange,
  parseReportDateParam,
} from "@/lib/reports";
import { planIncludesModule } from "@/lib/planLimits";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";
import { buildCsvRow } from "@/lib/csv";

const PROVIDER_LABELS: Record<string, string> = { STRIPE: "Stripe", WOMPI: "Wompi" };
const VALID_SECTIONS = ["citas", "ingresos", "comisiones", "consumo"] as const;
type Section = (typeof VALID_SECTIONS)[number];

function isValidSection(value: string | null): value is Section {
  return (VALID_SECTIONS as readonly string[]).includes(value ?? "");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug } = await params;
  // Mismo guard que la página: hereda su gating de plan y de rol OWNER/ADMIN
  // sin código nuevo.
  const { tenant } = await requireReportsAccess(tenantSlug);

  const url = new URL(request.url);
  const section = url.searchParams.get("section");
  if (!isValidSection(section)) {
    return NextResponse.json({ error: "Sección inválida." }, { status: 400 });
  }

  const parsedFrom = parseReportDateParam(url.searchParams.get("from") ?? undefined);
  const parsedTo = parseReportDateParam(url.searchParams.get("to") ?? undefined, { endOfDay: true });
  const { from, to } =
    parsedFrom && parsedTo ? { from: parsedFrom, to: parsedTo } : getDefaultReportRange(new Date());

  // Todos los profesionales, no solo los activos — ver el mismo comentario
  // en reports/page.tsx: un profesional desactivado con comisión pendiente
  // no debe desaparecer del export.
  const allProfessionals = await prisma.professional.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
  });

  const { statusCountsByStatus, revenueRows, commissionRows } = await computeReportData(
    tenant.id,
    allProfessionals,
    from,
    to
  );

  const rows: string[] = [];
  if (section === "citas") {
    rows.push(buildCsvRow(["Estado", "Cantidad"]));
    for (const status of Object.keys(statusCountsByStatus) as (keyof typeof statusCountsByStatus)[]) {
      rows.push(buildCsvRow([APPOINTMENT_STATUS_LABELS[status], statusCountsByStatus[status]]));
    }
  } else if (section === "ingresos") {
    rows.push(buildCsvRow(["Proveedor", "Moneda", "Cantidad de pagos", "Total"]));
    for (const row of revenueRows) {
      rows.push(
        buildCsvRow([
          PROVIDER_LABELS[row.provider] ?? row.provider,
          row.currency.toUpperCase(),
          row.count,
          row.currency.toLowerCase() === "cop" ? Math.round(row.total) : row.total.toFixed(2),
        ])
      );
    }
  } else if (section === "comisiones") {
    rows.push(
      buildCsvRow([
        "Profesional",
        "Citas completadas",
        "Ingreso por servicios",
        "% Comisión (default)",
        "Comisión total",
        "Comisión pagada",
        "Comisión pendiente",
      ])
    );
    for (const row of commissionRows) {
      rows.push(
        buildCsvRow([
          row.name,
          row.completedCount,
          Math.round(row.totalServiceRevenue),
          row.commissionRatePercent,
          Math.round(row.commissionAmount),
          Math.round(row.paidCommissionAmount),
          Math.round(row.pendingCommissionAmount),
        ])
      );
    }
  } else {
    // "consumo" — no depende del gating de plan acá (requireReportsAccess ya
    // exige el módulo "reports"): si el tenant no tiene el módulo
    // "inventory", simplemente no va a tener InventoryMovement, así que el
    // CSV sale con solo el encabezado. Se valida igual por prolijidad.
    rows.push(buildCsvRow(["Insumo", "Automático (citas)", "Manual", "Total consumido", "Unidad", "Valor (COP)"]));
    if (planIncludesModule(tenant.plan, "inventory")) {
      const consumptionRows = await computeInventoryConsumption(tenant.id, from, to);
      for (const row of consumptionRows) {
        rows.push(
          buildCsvRow([
            row.itemName,
            row.automaticQuantity,
            row.manualOutQuantity,
            row.totalQuantity,
            row.unit,
            row.totalValue !== null ? Math.round(row.totalValue) : "",
          ])
        );
      }
    }
  }

  const fromValue = from.toISOString().slice(0, 10);
  const toValue = to.toISOString().slice(0, 10);
  const csv = rows.join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${section}-${fromValue}-a-${toValue}.csv"`,
    },
  });
}
