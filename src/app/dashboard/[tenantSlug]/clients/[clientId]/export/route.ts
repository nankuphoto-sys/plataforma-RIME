import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import { getEffectiveClientFieldTemplate } from "@/lib/clientFieldTemplates";
import { decryptCustomFields } from "@/lib/clientCustomFields";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";
import { planIncludesModule } from "@/lib/planLimits";

// "Portabilidad de cliente" (módulo de nicho barbería, pero disponible para
// cualquier vertical): exporta el registro completo de UN cliente puntual —
// para que el cliente pueda llevárselo a otro negocio, o para que el negocio
// tenga un respaldo legible fuera de RIME. Distinto del pendiente "Descargar
// mis datos" de Mi cuenta (ese es la cuenta del NEGOCIO completa, este es un
// solo cliente).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; clientId: string }> }
): Promise<NextResponse> {
  const { tenantSlug, clientId } = await params;
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  // Mismo criterio "solo lo mío" que la página de detalle: un profesional
  // sin ningún otro rol en el tenant solo puede exportar clientes con los
  // que tiene al menos una cita, y solo ve sus propias citas dentro del
  // export — nunca las de otro profesional del mismo negocio.
  const isProfessionalOnly = isProfessionalOnlyInTenant(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id)
  );
  const viewerProfessionalId = isProfessionalOnly
    ? await getLinkedProfessionalId(session.user.id)
    : null;

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      tenantId: tenant.id,
      ...(isProfessionalOnly
        ? { appointments: { some: { professionalId: viewerProfessionalId ?? "__sin-profesional-vinculado__" } } }
        : {}),
    },
  });
  if (!client) notFound();

  const [appointments, fieldTemplate, packages] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clientId: client.id,
        tenantId: tenant.id,
        ...(isProfessionalOnly ? { professionalId: viewerProfessionalId! } : {}),
      },
      include: { service: true, professional: true },
      orderBy: { startsAt: "desc" },
    }),
    getEffectiveClientFieldTemplate(tenant.id, tenant.vertical),
    planIncludesModule(tenant.plan, "packages")
      ? prisma.sessionPackage.findMany({
          where: { clientId: client.id, tenantId: tenant.id },
          include: { service: true },
          orderBy: { purchasedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const customFieldsRaw = decryptCustomFields(client.customFields);
  // Se exportan con la etiqueta legible de cada campo (no la key camelCase
  // interna), pensado para que el archivo se pueda leer o importar en otro
  // negocio sin conocer el esquema interno de RIME.
  const customFieldsLabeled = Object.fromEntries(
    fieldTemplate
      .filter((field) => field.key in customFieldsRaw)
      .map((field) => [field.label, customFieldsRaw[field.key]])
  );

  const exportPayload = {
    exportadoEl: new Date().toISOString(),
    negocio: tenant.name,
    cliente: {
      nombre: client.name,
      email: client.email,
      telefono: client.phone,
      fechaNacimiento: client.birthdate,
      ficha: customFieldsLabeled,
    },
    historialDeCitas: appointments.map((appointment) => ({
      servicio: appointment.service.name,
      profesional: appointment.professional.name,
      fecha: appointment.startsAt,
      estado: APPOINTMENT_STATUS_LABELS[appointment.status],
    })),
    paquetesDeSesiones: packages.map((pkg) => ({
      servicio: pkg.service?.name ?? "Paquete general",
      sesionesUsadas: pkg.usedSessions,
      sesionesTotales: pkg.totalSessions,
      vence: pkg.expiresAt,
      estado: pkg.status,
    })),
  };

  const filename = `cliente-${client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
