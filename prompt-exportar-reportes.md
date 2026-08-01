# Prompt: Exportar reportes (CSV, PDF) + gráficos

## Contexto

`src/app/dashboard/[tenantSlug]/reports/page.tsx` ya calcula y muestra tres
secciones para un rango de fechas (`from`/`to`, ancladas siempre a
`Appointment.startsAt`, nunca a fecha de creación/confirmación de pago):
citas por estado, ingresos cobrados agrupados por proveedor+moneda (Stripe
usd y Wompi COP se muestran SIEMPRE por separado, nunca sumados entre sí —
regla ya establecida, no la rompas), y comisión por profesional (calculada
sobre `Service.price` de citas `COMPLETED`, nunca sobre `Payment.amount`).
Hoy todo eso vive como lógica inline dentro del Server Component de la
página, sin exportar nada y sin gráficos.

**Decisiones ya tomadas, no las vuelvas a plantear:**
- El PDF se genera de verdad en el servidor (no una vista imprimible con
  `window.print()`). Usá **`@react-pdf/renderer`** — es JS puro, sin
  binarios nativos ni navegador headless, así que corre bien en funciones
  serverless de Vercel (a diferencia de Puppeteer). El PDF es solo texto/
  tablas — **no intentes meter los gráficos dentro del PDF**, requeriría
  renderizar un navegador headless para rasterizarlos, que es justo lo que
  estamos evitando.
- Para los gráficos en pantalla, usá **`recharts`** (la librería de charts
  para React más estándar, se instala como dependencia nueva).
- CSV: no agregues ninguna librería para esto, es trivial — armá un helper
  chico a mano (escapar comillas/comas, terminar línea en `\r\n`).

## Qué hacer

### 1. Compartir la lógica de datos — `src/lib/reports.ts`

Extraé la lógica que hoy vive inline en `reports/page.tsx` (los tres
`Promise.all` + el armado de `statusCountsByStatus`/`revenueRows`/
`commissionRows`) a una función nueva y exportada en `src/lib/reports.ts`:

```ts
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

export async function computeReportData(
  tenantId: string,
  professionals: { id: string; name: string; commissionRate: Decimal | number }[],
  from: Date,
  to: Date
): Promise<ReportData> { ... }
```

(`reports.ts` hoy no importa `prisma` ni tipos de Prisma — vas a necesitar
agregarlos.) Esta función es la ÚNICA fuente de verdad: `reports/page.tsx`
Y los dos endpoints de export nuevos (más abajo) la llaman igual — así la
página, el CSV y el PDF nunca pueden mostrar números distintos entre sí.

**Reemplazá la lógica inline de `reports/page.tsx` por una llamada a esta
función.** Esto es un refactor puro — el HTML resultante y los números
mostrados en pantalla tienen que quedar exactamente iguales a como están
hoy. No cambies nada de lo que ya se ve en la página en este paso.

### 2. Gráficos — `src/app/dashboard/[tenantSlug]/reports/ReportsCharts.tsx`

Client component nuevo (`"use client"`, mismo patrón que `WeeklyAgenda.tsx`
— archivo aparte, recibe los datos ya calculados por props, no hace ninguna
llamada a la base). Tres gráficos de barras con `recharts`
(`ResponsiveContainer` + `BarChart`):

1. Citas por estado — una barra por status (`PENDING`/`CONFIRMED`/
   `COMPLETED`/`CANCELLED`/`NO_SHOW`), usando `APPOINTMENT_STATUS_LABELS`
   para las etiquetas.
2. Ingresos por proveedor/moneda — una barra por fila de `revenueRows`, con
   la etiqueta del eje X como `"Stripe (USD)"` / `"Wompi (COP)"` — nunca
   combines montos de distinta moneda en una sola barra ni en un total.
3. Comisión por profesional — una barra por profesional en `commissionRows`
   (`commissionAmount`), con el nombre como etiqueta.

Insertá `<ReportsCharts />` en `reports/page.tsx`, arriba de las tres
secciones de tablas existentes (que se mantienen igual, sin quitarlas — los
gráficos son un complemento visual, no un reemplazo de las tablas).

### 3. Export CSV — `src/app/dashboard/[tenantSlug]/reports/export/csv/route.ts`

Route Handler `GET`. Query params: `from`, `to` (mismo formato `yyyy-mm-dd`
que ya usa la página), `section` (`"citas" | "ingresos" | "comisiones"`).

- Guard: `requireReportsAccess(tenantSlug)` (mismo guard que ya usa la
  página — hereda el mismo gating de plan y de rol OWNER/ADMIN sin código
  nuevo).
- Parseá `from`/`to` con `parseReportDateParam` (si faltan o son inválidos,
  usá `getDefaultReportRange`, igual que la página).
- Llamá a `computeReportData(...)` y armá el CSV de la sección pedida:
  - `citas`: columnas `Estado, Cantidad`.
  - `ingresos`: columnas `Proveedor, Moneda, Cantidad de pagos, Total`.
  - `comisiones`: columnas `Profesional, Citas completadas, Ingreso por
    servicios, % Comisión, Comisión a pagar`.
- Helper nuevo en `src/lib/csv.ts`: `escapeCsvField(value: string | number):
  string` (envuelve en comillas dobles y escapa comillas internas si el
  valor tiene coma, comilla, o salto de línea) y `buildCsvRow(fields:
  (string | number)[]): string`. Uní filas con `\r\n`.
- Respondé con `Content-Type: text/csv; charset=utf-8` y
  `Content-Disposition: attachment; filename="<section>-<from>-a-<to>.csv"`.

### 4. Export PDF — `src/app/dashboard/[tenantSlug]/reports/export/pdf/route.ts`

Route Handler `GET`. Mismos query params `from`/`to` (sin `section` — el
PDF trae las tres secciones juntas).

- Mismo guard y mismo cálculo de rango/datos que el CSV.
- Componente `ReportPdfDocument` (puede vivir en el mismo archivo o en uno
  nuevo `ReportPdfDocument.tsx`) usando los primitivos de
  `@react-pdf/renderer` (`Document`, `Page`, `View`, `Text`, `StyleSheet`):
  encabezado con el nombre del tenant y el rango de fechas, y las tres
  tablas (citas/ingresos/comisiones) como texto plano en filas —  no hace
  falta que sea sofisticado visualmente, alcanza con que sea legible.
- Generá el buffer con `renderToBuffer(<ReportPdfDocument ... />)` y
  respondé con `Content-Type: application/pdf` y `Content-Disposition:
  attachment; filename="reporte-<tenantSlug>-<from>-a-<to>.pdf"`.

### 5. Botones de descarga en `reports/page.tsx`

- Un botón/link "Descargar PDF" arriba de todo (junto al filtro de fechas),
  apuntando a `/dashboard/${tenantSlug}/reports/export/pdf?from=${fromValue}&to=${toValue}`.
- Un link "Descargar CSV" junto al `<h2>` de cada una de las tres secciones,
  apuntando a `/dashboard/${tenantSlug}/reports/export/csv?section=<citas|ingresos|comisiones>&from=${fromValue}&to=${toValue}`.

## Qué NO hacer

- No sumes montos de distinta moneda en ningún gráfico, CSV, ni el PDF —
  misma regla que ya sigue la página hoy.
- No metas los gráficos dentro del PDF — el PDF es solo texto/tablas.
- No cambies el cálculo de `computeReportData` respecto a la lógica inline
  actual — es un refactor de extracción, no una reescritura. Los números
  que muestra la página hoy tienen que ser IDÉNTICOS después del refactor.
- No agregues ninguna librería para el CSV — a mano alcanza.
- No toques `updateProfessionalCommissionRateAction` ni el formulario de
  edición de comisión inline que ya existe en la tabla de profesionales.
- No agregues gating de plan nuevo — el export/gráficos heredan el mismo
  gating que ya tiene toda la página de Reportes vía `requireReportsAccess`.
- No toques `CLAUDE.md` — de eso me encargo yo.

## Verificación

1. Confirmá que, después del refactor de `computeReportData`, la página de
   Reportes muestra exactamente los mismos números que mostraba antes (con
   datos reales del tenant demo o uno de prueba) — comparalo antes/después.
2. Confirmá que los tres gráficos se renderizan con datos reales y que el
   de ingresos nunca combina Stripe y Wompi en una sola barra si hay pagos
   de ambos proveedores en el rango.
3. Descargá el CSV de cada una de las tres secciones y abrilo (Excel/Sheets
   o un editor de texto) — confirmá que las columnas y los valores
   coinciden con lo que muestra la tabla en pantalla para el mismo rango.
4. Descargá el PDF y confirmá que abre correctamente y que las tres
   secciones tienen los mismos números que la pantalla.
5. Probá con un rango de fechas sin ningún pago/cita — confirmá que el CSV
   y el PDF no rompen (deberían salir con las secciones vacías o en cero,
   no tirar un error 500).
6. Confirmá que un usuario sin acceso a Reportes (según
   `requireReportsAccess`, ej. un tenant en un plan sin el módulo, o un
   STAFF) recibe el mismo bloqueo/redirect al pegar directamente la URL de
   `/reports/export/csv` o `/reports/export/pdf`, no solo en la página.
7. Confirmá que los tests existentes siguen pasando.

Contame qué verificaste en vivo, no solo qué escribiste.
