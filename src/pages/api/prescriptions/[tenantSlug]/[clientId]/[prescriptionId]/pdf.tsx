import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasAnyRoleInTenantLocations } from "@/lib/authorization";
import { planIncludesModule } from "@/lib/planLimits";

// Vive en Pages Router por el mismo motivo ya documentado en detalle en
// src/pages/api/reports/[tenantSlug]/pdf.tsx (conflicto de @react-pdf/renderer
// con el grafo de módulos "react-server" de App Router) — reimplica a mano
// la lógica de requireDashboardAccess/requirePrescriptionsAccess
// (src/lib/auth-guards.ts) con respuestas HTTP en vez de redirect()/notFound(),
// leyendo el JWT con getToken (agnóstico de router) en vez de auth(req, res).

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  header: { marginBottom: 24, borderBottomWidth: 1, borderBottomColor: "#000000", paddingBottom: 12 },
  tenantName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 14, marginTop: 16, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 10, color: "#555555", marginBottom: 4 },
  content: { marginTop: 12, lineHeight: 1.5 },
});

interface PrescriptionPdfDocumentProps {
  tenantName: string;
  clientName: string;
  professionalName: string;
  issuedAtLabel: string;
  title: string;
  content: string;
}

function PrescriptionPdfDocument({
  tenantName,
  clientName,
  professionalName,
  issuedAtLabel,
  title,
  content,
}: PrescriptionPdfDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.tenantName}>{tenantName}</Text>
          <Text style={styles.meta}>Profesional: {professionalName}</Text>
          <Text style={styles.meta}>Fecha: {issuedAtLabel}</Text>
          <Text style={styles.meta}>Cliente: {clientName}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.content}>{content}</Text>
      </Page>
    </Document>
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const tenantSlug = req.query.tenantSlug as string;
  const clientId = req.query.clientId as string;
  const prescriptionId = req.query.prescriptionId as string;

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

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, include: { locations: true } });
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

  if (!planIncludesModule(tenant.plan, "prescriptions")) {
    res.redirect(302, `/dashboard/${tenantSlug}/plan-required?feature=recetas&requiredPlan=INDIVIDUAL`);
    return;
  }

  // La receta debe pertenecer a este tenant Y a este cliente puntual — nunca
  // confiar solo en el id de la URL.
  const prescription = await prisma.prescription.findFirst({
    where: { id: prescriptionId, tenantId: tenant.id, clientId },
    include: { professional: true, client: true },
  });
  if (!prescription) {
    res.status(404).end();
    return;
  }

  const issuedAtLabel = prescription.issuedAt.toLocaleDateString("es-CL", { dateStyle: "medium" });

  const buffer = await renderToBuffer(
    <PrescriptionPdfDocument
      tenantName={tenant.name}
      clientName={prescription.client.name}
      professionalName={prescription.professional.name}
      issuedAtLabel={issuedAtLabel}
      title={prescription.title ?? "Receta"}
      content={prescription.content}
    />
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="receta-${prescriptionId}.pdf"`);
  res.send(buffer);
}
