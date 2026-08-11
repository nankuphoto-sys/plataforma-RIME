"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppointmentStatus } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";

// Paleta de marca del proyecto (ver tailwind.config.ts) — se reutiliza acá
// en vez de sumar una paleta nueva solo para gráficos, para que Reportes se
// vea consistente con el resto del dashboard (badges de estado, botones).
// Cada barra ya lleva su categoría como label directo en el eje X (y su
// valor arriba de la barra), así que la identidad nunca depende solo del
// color — mitiga que pine/berry no separan bien para protanopía.
// Valores tomados directo de tailwind.config.ts — estaban hardcodeados con
// la paleta verde vieja de antes del rebranding a turquesa (Booksy) y nunca
// se actualizaron, quedando desentonados con el resto del dashboard.
const COLOR_PINE = "#1E7F95";
const COLOR_BERRY = "#E0455C";
const COLOR_GOLD = "#F2A93B";
const COLOR_NEUTRAL = "#E5E7EB";
const AXIS_TEXT_COLOR = "#17181A";
const GRID_COLOR = "#EEF0F1";

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  PENDING: COLOR_GOLD,
  CONFIRMED: COLOR_PINE,
  COMPLETED: COLOR_PINE,
  CANCELLED: COLOR_NEUTRAL,
  NO_SHOW: COLOR_BERRY,
};

// Color fijo por proveedor (nunca por orden de aparición en los datos) —
// mismo proveedor siempre el mismo color entre renders/rangos de fecha.
const PROVIDER_COLORS: Record<string, string> = {
  STRIPE: COLOR_PINE,
  WOMPI: COLOR_BERRY,
};
const PROVIDER_LABELS: Record<string, string> = { STRIPE: "Stripe", WOMPI: "Wompi" };

interface ReportsChartsProps {
  statusCountsByStatus: Record<AppointmentStatus, number>;
  revenueRows: { provider: string; currency: string; total: number; count: number }[];
  commissionRows: { id: string; name: string; commissionAmount: number }[];
}

const CHART_HEIGHT = 240;

// Los formatter de recharts reciben ValueType | undefined (number | string |
// ReadonlyArray<...> | undefined) sin importar que dataKey="value" siempre
// sea un number acá — se normaliza una sola vez.
function toDisplayNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function ReportsCharts({ statusCountsByStatus, revenueRows, commissionRows }: ReportsChartsProps) {
  const statusData = (Object.keys(statusCountsByStatus) as AppointmentStatus[]).map((status) => ({
    status,
    label: APPOINTMENT_STATUS_LABELS[status],
    value: statusCountsByStatus[status],
    fill: STATUS_COLORS[status],
  }));
  const hasAnyAppointments = statusData.some((row) => row.value > 0);

  // Nunca se combina Stripe y Wompi (ni distintas monedas) en una sola
  // barra o total — cada fila de revenueRows ya viene separada por
  // proveedor+moneda, acá solo se le arma la etiqueta del eje X.
  const revenueData = revenueRows.map((row) => ({
    key: `${row.provider}-${row.currency}`,
    label: `${PROVIDER_LABELS[row.provider] ?? row.provider} (${row.currency.toUpperCase()})`,
    value: row.total,
    fill: PROVIDER_COLORS[row.provider] ?? COLOR_GOLD,
  }));

  const commissionData = commissionRows.map((row) => ({
    key: row.id,
    label: row.name,
    value: row.commissionAmount,
  }));

  return (
    <div className="mt-10 grid gap-8 md:grid-cols-3">
      <ChartCard title="Citas por estado">
        {!hasAnyAppointments ? (
          <EmptyChartState message="No hay citas en este rango." />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={statusData} barCategoryGap="30%">
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                cursor={{ fill: GRID_COLOR }}
                formatter={(value) => [toDisplayNumber(value), "Citas"]}
              />
              <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]}>
                {statusData.map((entry) => (
                  <Cell key={entry.status} fill={entry.fill} />
                ))}
                <LabelList dataKey="value" position="top" fill={AXIS_TEXT_COLOR} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Ingresos por proveedor">
        {revenueData.length === 0 ? (
          <EmptyChartState message="No hay pagos confirmados en este rango." />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={revenueData} barCategoryGap="30%">
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                cursor={{ fill: GRID_COLOR }}
                formatter={(value) => toDisplayNumber(value).toFixed(2)}
              />
              <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]}>
                {revenueData.map((entry) => (
                  <Cell key={entry.key} fill={entry.fill} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  fill={AXIS_TEXT_COLOR}
                  fontSize={11}
                  formatter={(value) => toDisplayNumber(value).toFixed(0)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Comisión por profesional">
        {commissionData.length === 0 ? (
          <EmptyChartState message="Este negocio todavía no tiene profesionales activos." />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={commissionData} barCategoryGap="30%">
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                cursor={{ fill: GRID_COLOR }}
                formatter={(value) => toDisplayNumber(value).toFixed(2)}
              />
              <Bar dataKey="value" fill={COLOR_PINE} maxBarSize={24} radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  fill={AXIS_TEXT_COLOR}
                  fontSize={11}
                  formatter={(value) => toDisplayNumber(value).toFixed(0)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <p className="section-title text-sm">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div style={{ height: CHART_HEIGHT }} className="flex items-center justify-center text-sm text-ink/40">
      {message}
    </div>
  );
}
