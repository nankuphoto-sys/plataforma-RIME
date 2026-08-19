import type { AppointmentStatus } from "@prisma/client";
import { CalendarCheck, CheckCircle2, Clock, DollarSign, Download, FileDown, Filter, Save } from "lucide-react";
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
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { askReportsCopilotAction, markCommissionAsPaidAction, updateProfessionalCommissionRateAction } from "./actions";
import { ReportsCharts } from "./ReportsCharts";
import { AskCopilotBox } from "../AskCopilotBox";

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
  const parsedTo = parseReportDateParam(toParam, { endOfDay: true });
  const { from, to } =
    parsedFrom && parsedTo ? { from: parsedFrom, to: parsedTo } : getDefaultReportRange(new Date());

  // Todos los profesionales, no solo los activos (tenant.professionals del
  // guard filtra active: true, correcto para el flujo de reserva) — un
  // profesional desactivado puede seguir teniendo comisión pendiente de un
  // período anterior, y desaparecer del reporte dejaría esa plata sin forma
  // de marcarse como pagada desde el dashboard.
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

  // KPIs grandes arriba de los gráficos — solo cifras que se pueden sumar
  // sin mezclar cosas que no son comparables: citas (siempre un conteo) y
  // comisión (siempre USD, ver el comentario en ReportData.commissionRows).
  // Nunca un "ingreso total" acá — revenueRows mezcla proveedores con
  // monedas distintas (USD de Stripe, COP de Wompi) que no se pueden sumar
  // en un solo número sin mentir.
  const totalAppointments = Object.values(statusCountsByStatus).reduce((sum, n) => sum + n, 0);
  const totalServiceRevenue = commissionRows.reduce((sum, row) => sum + row.totalServiceRevenue, 0);
  const totalPendingCommission = commissionRows.reduce((sum, row) => sum + row.pendingCommissionAmount, 0);

  // Consumo de insumos hereda el gating de plan del módulo "inventory" — un
  // tenant sin ese módulo (ej. BASICO) no tiene datos de inventario de
  // todos modos, así que la sección directamente no se muestra en vez de
  // aparecer vacía.
  const hasInventoryModule = planIncludesModule(tenant.plan, "inventory");
  const inventoryConsumptionRows = hasInventoryModule
    ? await computeInventoryConsumption(tenant.id, from, to)
    : [];

  const fromValue = toDateInputValue(from);
  const toValue = toDateInputValue(to);

  const exportBase = `/dashboard/${tenantSlug}/reports/export`;
  const rangeQuery = `from=${fromValue}&to=${toValue}`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Reportes</h1>
        {/* El export CSV es un Route Handler normal (src/app/.../export/csv),
            pero el de PDF vive en Pages Router (src/pages/api/reports/[tenantSlug]/pdf)
            — ver el comentario en ese archivo sobre por qué @react-pdf/renderer
            no funciona dentro del grafo de módulos de App Router. */}
        <a href={`/api/reports/${tenantSlug}/pdf?${rangeQuery}`} className="btn-secondary">
          <FileDown className="h-4 w-4" />
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
          <Filter className="h-4 w-4" />
          Aplicar
        </button>
      </form>

      {planIncludesModule(tenant.plan, "aiAssistant") && (
        <div className="mt-6">
          <AskCopilotBox
            title="Pregúntale a tus reportes"
            subtitle="Responde sobre ingresos, citas y comisiones de este negocio. No sabe de inventario ni de clientes."
            scopeLabel="Solo lectura"
            placeholder="¿Cuánto facturé este mes?"
            examples={["¿Cuánto facturé hoy?", "¿Cuánto llevo facturado en el año?"]}
            action={askReportsCopilotAction.bind(null, tenantSlug)}
          />
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile
          icon={<CalendarCheck className="h-5 w-5" />}
          label="Citas en el período"
          value={totalAppointments}
        />
        <KpiTile
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Completadas"
          value={statusCountsByStatus.COMPLETED}
          tone="pine"
        />
        <KpiTile
          icon={<DollarSign className="h-5 w-5" />}
          label="Ingreso por servicios"
          value={totalServiceRevenue}
          decimals={2}
          prefix="USD "
        />
        <KpiTile
          icon={<Clock className="h-5 w-5" />}
          label="Comisión pendiente"
          value={totalPendingCommission}
          decimals={2}
          prefix="USD "
          tone={totalPendingCommission > 0 ? "gold" : undefined}
        />
      </div>

      <ReportsCharts
        statusCountsByStatus={statusCountsByStatus}
        revenueRows={revenueRows}
        commissionRows={commissionRows}
      />

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="section-title">Citas del período</h2>
          <a href={`${exportBase}/csv?section=citas&${rangeQuery}`} className="group inline-flex items-center gap-1 shell-link">
            <Download className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-y-0.5" />
            Descargar CSV
          </a>
        </div>
        <ul className="mt-3 max-w-sm space-y-1 text-sm">
          {(Object.keys(statusCountsByStatus) as AppointmentStatus[]).map((status) => (
            <li key={status} className="flex justify-between border-b border-sage-dark/20 py-1.5">
              <span className="text-ink/60">{APPOINTMENT_STATUS_LABELS[status]}</span>
              <AnimatedNumber value={statusCountsByStatus[status]} className="data-mono font-medium text-ink" />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="section-title">Ingresos cobrados</h2>
          <a href={`${exportBase}/csv?section=ingresos&${rangeQuery}`} className="group inline-flex items-center gap-1 shell-link">
            <Download className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-y-0.5" />
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
                  {row.currency.toUpperCase()}{" "}
                  <AnimatedNumber value={row.total} decimals={2} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="section-title">Comisiones por profesional</h2>
          <a href={`${exportBase}/csv?section=comisiones&${rangeQuery}`} className="group inline-flex items-center gap-1 shell-link">
            <Download className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-y-0.5" />
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
                  <th className="table-head-cell">Comisión total</th>
                  <th className="table-head-cell">Pagada</th>
                  <th className="table-head-cell">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {commissionRows.map((row) => (
                  <tr key={row.id} className="table-row">
                    <td className="table-cell font-medium">{row.name}</td>
                    <td className="table-cell-muted data-mono">
                      <AnimatedNumber value={row.completedCount} />
                    </td>
                    <td className="table-cell-muted data-mono">
                      USD <AnimatedNumber value={row.totalServiceRevenue} decimals={2} />
                    </td>
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
                        <SubmitButton
                          icon={<Save className="h-3.5 w-3.5" />}
                          pendingLabel="Guardando…"
                          className="btn-secondary-sm"
                        >
                          Guardar
                        </SubmitButton>
                      </form>
                      <p className="mt-1 text-xs text-ink/40">Default — un servicio puede tener su propio %.</p>
                    </td>
                    <td className="table-cell-muted data-mono">
                      USD <AnimatedNumber value={row.commissionAmount} decimals={2} />
                    </td>
                    <td className="table-cell-muted data-mono">
                      USD <AnimatedNumber value={row.paidCommissionAmount} decimals={2} />
                    </td>
                    <td className="table-cell-muted">
                      <span className="data-mono">
                        USD <AnimatedNumber value={row.pendingCommissionAmount} decimals={2} />
                      </span>
                      {row.pendingCommissionAmount > 0 && (
                        <form
                          action={markCommissionAsPaidAction.bind(null, tenantSlug, row.id)}
                          className="mt-1"
                        >
                          <input type="hidden" name="from" value={fromValue} />
                          <input type="hidden" name="to" value={toValue} />
                          <SubmitButton
                            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                            pendingLabel="Marcando…"
                            className="btn-secondary-sm whitespace-nowrap"
                          >
                            Marcar como pagada
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {hasInventoryModule && (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="section-title">Consumo de insumos</h2>
            <a href={`${exportBase}/csv?section=consumo&${rangeQuery}`} className="group inline-flex items-center gap-1 shell-link">
              <Download className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-y-0.5" />
              Descargar CSV
            </a>
          </div>
          {inventoryConsumptionRows.length === 0 ? (
            <p className="mt-3 text-sm text-ink/40">No hay salidas de inventario en este rango.</p>
          ) : (
            <div className="table-shell mt-3">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="table-head-cell">Insumo</th>
                    <th className="table-head-cell">Automático (citas)</th>
                    <th className="table-head-cell">Manual</th>
                    <th className="table-head-cell">Total consumido</th>
                    <th className="table-head-cell">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryConsumptionRows.map((row) => (
                    <tr key={row.itemId} className="table-row">
                      <td className="table-cell font-medium">{row.itemName}</td>
                      <td className="table-cell-muted data-mono">
                        {row.automaticQuantity} {row.unit}
                      </td>
                      <td className="table-cell-muted data-mono">
                        {row.manualOutQuantity} {row.unit}
                      </td>
                      <td className="table-cell-muted data-mono">
                        {row.totalQuantity} {row.unit}
                      </td>
                      <td className="table-cell-muted data-mono">
                        {row.totalValue !== null ? `USD ${row.totalValue.toFixed(2)}` : "Sin costo cargado"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  decimals = 0,
  prefix = "",
  tone = "pine",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  tone?: "pine" | "gold";
}) {
  return (
    <div className="panel">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          tone === "gold" ? "bg-gold/15 text-gold" : "bg-pine/10 text-pine-dark"
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <p className="data-mono mt-3 text-2xl font-semibold text-ink">
        {prefix}
        <AnimatedNumber value={value} decimals={decimals} />
      </p>
      <p className="mt-0.5 text-xs text-ink/50">{label}</p>
    </div>
  );
}
