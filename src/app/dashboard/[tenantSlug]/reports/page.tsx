import type { AppointmentStatus } from "@prisma/client";
import { requireReportsAccess } from "@/lib/auth-guards";
import { computeReportData, getDefaultReportRange, parseReportDateParam } from "@/lib/reports";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";
import { updateProfessionalCommissionRateAction } from "./actions";
import { ReportsCharts } from "./ReportsCharts";

const PROVIDER_LABELS: Record<string, string> = { STRIPE: "Stripe", WOMPI: "Wompi" };

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string; error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { from: fromParam, to: toParam, error } = await searchParams;
  const { tenant } = await requireReportsAccess(tenantSlug);

  // Rango inválido o incompleto -> se usa el default completo (no mezclamos
  // un `from` custom con un `to` default, o viceversa).
  const parsedFrom = parseReportDateParam(fromParam);
  const parsedTo = parseReportDateParam(toParam);
  const { from, to } =
    parsedFrom && parsedTo ? { from: parsedFrom, to: parsedTo } : getDefaultReportRange(new Date());

  const { statusCountsByStatus, revenueRows, commissionRows } = await computeReportData(
    tenant.id,
    tenant.professionals,
    from,
    to
  );

  const fromValue = toDateInputValue(from);
  const toValue = toDateInputValue(to);

  const exportBase = `/dashboard/${tenantSlug}/reports/export`;
  const rangeQuery = `from=${fromValue}&to=${toValue}`;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Reportes</h1>
        {/* El export CSV es un Route Handler normal (src/app/.../export/csv),
            pero el de PDF vive en Pages Router (src/pages/api/reports/[tenantSlug]/pdf)
            — ver el comentario en ese archivo sobre por qué @react-pdf/renderer
            no funciona dentro del grafo de módulos de App Router. */}
        <a href={`/api/reports/${tenantSlug}/pdf?${rangeQuery}`} className="btn-secondary">
          Descargar PDF
        </a>
      </div>

      {error && <p className="msg-error mt-3">{error}</p>}

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label" htmlFor="from">
            Desde
          </label>
          <input id="from" name="from" type="date" defaultValue={fromValue} className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="to">
            Hasta
          </label>
          <input id="to" name="to" type="date" defaultValue={toValue} className="field-input" />
        </div>
        <button type="submit" className="btn-primary">
          Aplicar
        </button>
      </form>

      <ReportsCharts
        statusCountsByStatus={statusCountsByStatus}
        revenueRows={revenueRows}
        commissionRows={commissionRows}
      />

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="section-title">Citas del período</h2>
          <a href={`${exportBase}/csv?section=citas&${rangeQuery}`} className="shell-link">
            Descargar CSV
          </a>
        </div>
        <ul className="mt-3 max-w-sm space-y-1 text-sm">
          {(Object.keys(statusCountsByStatus) as AppointmentStatus[]).map((status) => (
            <li key={status} className="flex justify-between border-b border-sage-dark/20 py-1.5">
              <span className="text-ink/60">{APPOINTMENT_STATUS_LABELS[status]}</span>
              <span className="data-mono font-medium text-ink">{statusCountsByStatus[status]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="section-title">Ingresos cobrados</h2>
          <a href={`${exportBase}/csv?section=ingresos&${rangeQuery}`} className="shell-link">
            Descargar CSV
          </a>
        </div>
        {revenueRows.length === 0 ? (
          <p className="mt-3 text-sm text-ink/40">No hay pagos confirmados en este rango.</p>
        ) : (
          <ul className="mt-3 max-w-md space-y-1 text-sm">
            {revenueRows.map((row) => (
              <li
                key={`${row.provider}-${row.currency}`}
                className="flex justify-between border-b border-sage-dark/20 py-1.5"
              >
                <span className="text-ink/60">
                  {PROVIDER_LABELS[row.provider] ?? row.provider} · {row.count} pago
                  {row.count === 1 ? "" : "s"}
                </span>
                <span className="data-mono font-medium text-ink">
                  {row.currency.toUpperCase()} {row.total.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="section-title">Comisiones por profesional</h2>
          <a href={`${exportBase}/csv?section=comisiones&${rangeQuery}`} className="shell-link">
            Descargar CSV
          </a>
        </div>
        {commissionRows.length === 0 ? (
          <p className="mt-3 text-sm text-ink/40">Este negocio todavía no tiene profesionales activos.</p>
        ) : (
          <div className="table-shell mt-3">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="table-head-cell">Profesional</th>
                  <th className="table-head-cell">Citas completadas</th>
                  <th className="table-head-cell">Ingreso por servicios</th>
                  <th className="table-head-cell">% Comisión</th>
                  <th className="table-head-cell">Comisión a pagar</th>
                </tr>
              </thead>
              <tbody>
                {commissionRows.map((row) => (
                  <tr key={row.id} className="table-row">
                    <td className="table-cell font-medium">{row.name}</td>
                    <td className="table-cell-muted data-mono">{row.completedCount}</td>
                    <td className="table-cell-muted data-mono">USD {row.totalServiceRevenue.toFixed(2)}</td>
                    <td className="table-cell-muted">
                      <form
                        action={updateProfessionalCommissionRateAction.bind(null, tenantSlug, row.id)}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="from" value={fromValue} />
                        <input type="hidden" name="to" value={toValue} />
                        <input
                          type="number"
                          name="commissionRate"
                          step="0.01"
                          min="0"
                          max="100"
                          defaultValue={row.commissionRatePercent}
                          className="field-input data-mono mt-0 w-20 px-2 py-1"
                        />
                        <button type="submit" className="btn-secondary-sm">
                          Guardar
                        </button>
                      </form>
                    </td>
                    <td className="table-cell-muted data-mono">USD {row.commissionAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
