import { NextResponse } from "next/server";
import { requireReportsAccess } from "@/lib/auth-guards";
import { computeReportData, getDefaultReportRange, parseReportDateParam } from "@/lib/reports";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";
import { buildCsvRow } from "@/lib/csv";

const PROVIDER_LABELS: Record<string, string> = { STRIPE: "Stripe", WOMPI: "Wompi" };
const VALID_SECTIONS = ["citas", "ingresos", "comisiones"] as const;
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
  const parsedTo = parseReportDateParam(url.searchParams.get("to") ?? undefined);
  const { from, to } =
    parsedFrom && parsedTo ? { from: parsedFrom, to: parsedTo } : getDefaultReportRange(new Date());

  const { statusCountsByStatus, revenueRows, commissionRows } = await computeReportData(
    tenant.id,
    tenant.professionals,
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
          row.total.toFixed(2),
        ])
      );
    }
  } else {
    rows.push(
      buildCsvRow([
        "Profesional",
        "Citas completadas",
        "Ingreso por servicios",
        "% Comisión",
        "Comisión a pagar",
      ])
    );
    for (const row of commissionRows) {
      rows.push(
        buildCsvRow([
          row.name,
          row.completedCount,
          row.totalServiceRevenue.toFixed(2),
          row.commissionRatePercent,
          row.commissionAmount.toFixed(2),
        ])
      );
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
