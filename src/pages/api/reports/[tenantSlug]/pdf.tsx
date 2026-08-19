import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { AppointmentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasAnyOfRolesInTenantLocations, hasAnyRoleInTenantLocations } from "@/lib/authorization";
import { planIncludesModule } from "@/lib/planLimits";
import { computeReportData, getDefaultReportRange, parseReportDateParam, type ReportData } from "@/lib/reports";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";
import { formatCOPNumber } from "@/lib/currency";

// Este endpoint vive en Pages Router (src/pages/api/), no en App Router,
// a propósito: @react-pdf/renderer crea sus elementos con su propio
// reconciler de React, y en Next 15 todo lo que cuelga de src/app/
// (incluidos los Route Handlers) se compila bajo la condición de módulo
// "react-server", que le da a nuestro JSX una copia de React distinta a la
// que ve el reconciler de react-pdf al hacer sus propios require("react")
// internos — eso dispara "Minified React error #31" (objeto no válido como
// hijo de React) apenas se llama a renderToBuffer, confirmado en vivo con
// una prueba mínima (<Document><Page><Text>) que falla igual sin ningún dato
// de negocio de por medio. Las rutas de Pages Router no pasan por ese grafo
// de módulos de RSC, así que el mismo código funciona sin cambios ahí — se
// verificó con esa misma prueba mínima antes de mover el endpoint real.
//
// Por eso este archivo reimplica a mano la lógica de requireReportsAccess
// (src/lib/auth-guards.ts) en vez de importarla: esa función usa
// redirect()/notFound() de next/navigation, que son primitivas exclusivas
// de App Router y no funcionan en un handler de Pages Router. Tampoco se usa
// `auth(req, res)` de src/lib/auth.ts — ese overload de NextAuth v5 importa
// internamente "next/server" (otro módulo exclusivo de App Router) y tira
// ERR_MODULE_NOT_FOUND en este contexto — en su lugar se lee el JWT
// directamente con `getToken` de next-auth/jwt, que sí es agnóstico de
// router y trae los mismos campos (userId/tenantId/locationRoles) que ya
// carga el callback `jwt` de src/lib/auth.ts.

const PROVIDER_LABELS: Record<string, string> = { STRIPE: "Stripe", WOMPI: "Wompi" };

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#555555", marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#DDDDDD", paddingVertical: 4 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000000", paddingBottom: 4 },
  cell: { flex: 1 },
  headerCell: { flex: 1, fontFamily: "Helvetica-Bold" },
  empty: { color: "#777777", fontStyle: "italic" },
});

interface ReportPdfDocumentProps {
  tenantName: string;
  fromLabel: string;
  toLabel: string;
  data: ReportData;
}

function ReportPdfDocument({ tenantName, fromLabel, toLabel, data }: ReportPdfDocumentProps) {
  const { statusCountsByStatus, revenueRows, commissionRows } = data;
  const statuses = Object.keys(statusCountsByStatus) as AppointmentStatus[];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Reporte — {tenantName}</Text>
        <Text style={styles.subtitle}>
          Período: {fromLabel} a {toLabel}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Citas del período</Text>
          <View style={styles.headerRow}>
            <Text style={styles.headerCell}>Estado</Text>
            <Text style={styles.headerCell}>Cantidad</Text>
          </View>
          {statuses.map((status) => (
            <View key={status} style={styles.row}>
              <Text style={styles.cell}>{APPOINTMENT_STATUS_LABELS[status]}</Text>
              <Text style={styles.cell}>{statusCountsByStatus[status]}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingresos cobrados</Text>
          {revenueRows.length === 0 ? (
            <Text style={styles.empty}>No hay pagos confirmados en este rango.</Text>
          ) : (
            <View>
              <View style={styles.headerRow}>
                <Text style={styles.headerCell}>Proveedor</Text>
                <Text style={styles.headerCell}>Moneda</Text>
                <Text style={styles.headerCell}>Cantidad de pagos</Text>
                <Text style={styles.headerCell}>Total</Text>
              </View>
              {revenueRows.map((row) => (
                <View key={`${row.provider}-${row.currency}`} style={styles.row}>
                  <Text style={styles.cell}>{PROVIDER_LABELS[row.provider] ?? row.provider}</Text>
                  <Text style={styles.cell}>{row.currency.toUpperCase()}</Text>
                  <Text style={styles.cell}>{row.count}</Text>
                  <Text style={styles.cell}>{formatCOPNumber(row.total)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comisiones por profesional</Text>
          {commissionRows.length === 0 ? (
            <Text style={styles.empty}>Este negocio todavía no tiene profesionales activos.</Text>
          ) : (
            <View>
              <View style={styles.headerRow}>
                <Text style={styles.headerCell}>Profesional</Text>
                <Text style={styles.headerCell}>Citas</Text>
                <Text style={styles.headerCell}>Ingreso</Text>
                <Text style={styles.headerCell}>% (default)</Text>
                <Text style={styles.headerCell}>Total</Text>
                <Text style={styles.headerCell}>Pagada</Text>
                <Text style={styles.headerCell}>Pendiente</Text>
              </View>
              {commissionRows.map((row) => (
                <View key={row.id} style={styles.row}>
                  <Text style={styles.cell}>{row.name}</Text>
                  <Text style={styles.cell}>{row.completedCount}</Text>
                  <Text style={styles.cell}>$ {formatCOPNumber(row.totalServiceRevenue)}</Text>
                  <Text style={styles.cell}>{row.commissionRatePercent}%</Text>
                  <Text style={styles.cell}>$ {formatCOPNumber(row.commissionAmount)}</Text>
                  <Text style={styles.cell}>$ {formatCOPNumber(row.paidCommissionAmount)}</Text>
                  <Text style={styles.cell}>$ {formatCOPNumber(row.pendingCommissionAmount)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const tenantSlug = req.query.tenantSlug as string;

  // Réplica de requireReportsAccess/requireDashboardAccess
  // (src/lib/auth-guards.ts) con respuestas HTTP en vez de redirect()/notFound().
  const token = await getToken({
    req: { headers: req.headers as Record<string, string> },
    secret: process.env.AUTH_SECRET,
  });
  if (!token) {
    res.redirect(302, "/login");
    return;
  }
  const userTenantId = token.tenantId as string;
  const userLocationRoles = token.locationRoles as { locationId: string; role: Role }[];

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      locations: true,
      // Todos los profesionales, no solo los activos — uno desactivado con
      // comisión pendiente de un período anterior no debe desaparecer del PDF.
      professionals: { orderBy: { name: "asc" } },
    },
  });
  if (!tenant) {
    res.status(404).end();
    return;
  }
  if (userTenantId !== tenant.id) {
    res.status(404).end();
    return;
  }
  if (tenant.status === "PAST_DUE" || tenant.status === "CANCELLED") {
    res.redirect(302, `/dashboard/${tenantSlug}/account-locked`);
    return;
  }

  const locationIds = tenant.locations.map((location) => location.id);
  const hasAccess = hasAnyRoleInTenantLocations(userLocationRoles, locationIds);
  if (!hasAccess) {
    res.status(404).end();
    return;
  }

  if (!planIncludesModule(tenant.plan, "reports")) {
    res.redirect(302, `/dashboard/${tenantSlug}/plan-required?feature=reportes&requiredPlan=BASICO`);
    return;
  }

  const hasReportsAccess = hasAnyOfRolesInTenantLocations(userLocationRoles, locationIds, [
    "OWNER",
    "ADMIN",
  ]);
  if (!hasReportsAccess) {
    res.status(404).end();
    return;
  }

  const parsedFrom = parseReportDateParam(
    typeof req.query.from === "string" ? req.query.from : undefined
  );
  const parsedTo = parseReportDateParam(
    typeof req.query.to === "string" ? req.query.to : undefined,
    { endOfDay: true }
  );
  const { from, to } =
    parsedFrom && parsedTo ? { from: parsedFrom, to: parsedTo } : getDefaultReportRange(new Date());

  const data = await computeReportData(tenant.id, tenant.professionals, from, to);

  const fromValue = from.toISOString().slice(0, 10);
  const toValue = to.toISOString().slice(0, 10);

  const buffer = await renderToBuffer(
    <ReportPdfDocument tenantName={tenant.name} fromLabel={fromValue} toLabel={toValue} data={data} />
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="reporte-${tenantSlug}-${fromValue}-a-${toValue}.pdf"`
  );
  res.send(buffer);
}
