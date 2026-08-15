import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerAccess } from "@/lib/auth-guards";
import { getEffectiveClientFieldTemplate } from "@/lib/clientFieldTemplates";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";

// "Descargar mis datos" de Mi cuenta — la cuenta del NEGOCIO completa, no un
// solo cliente (para eso está clients/[clientId]/export, ver el comentario
// ahí). Mismo criterio de "etiquetas legibles, no keys internas" para la
// ficha de cada cliente. Solo OWNER (requireOwnerAccess, mismo guard que
// Facturación y Configuración) — es el respaldo completo del negocio,
// incluye datos de todo el equipo y de todos los clientes, no solo lo propio
// de quien lo pide.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug } = await params;
  const { tenant } = await requireOwnerAccess(tenantSlug);

  const [
    locations,
    team,
    professionals,
    services,
    clients,
    appointments,
    inventoryItems,
    packages,
    giftCards,
    reviews,
    fieldTemplate,
  ] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.staffLocationRole.findMany({
      where: { location: { tenantId: tenant.id } },
      include: { user: { select: { name: true, email: true } }, location: { select: { name: true } } },
    }),
    prisma.professional.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { tenantId: tenant.id },
      include: { service: true, professional: true, client: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: { tenantId: tenant.id },
      include: { stockLevels: { include: { location: { select: { name: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.sessionPackage.findMany({
      where: { tenantId: tenant.id },
      include: { client: { select: { name: true } }, service: { select: { name: true } } },
      orderBy: { purchasedAt: "asc" },
    }),
    prisma.giftCard.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.review.findMany({
      where: { tenantId: tenant.id, submittedAt: { not: null } },
      include: { client: { select: { name: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    getEffectiveClientFieldTemplate(tenant.id, tenant.vertical),
  ]);

  // Mismo criterio que clients/[clientId]/export: etiqueta legible de cada
  // campo, no la key camelCase interna.
  const labelCustomFields = (customFields: unknown): Record<string, unknown> => {
    const raw = (customFields ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      fieldTemplate.filter((field) => field.key in raw).map((field) => [field.label, raw[field.key]])
    );
  };

  const exportPayload = {
    exportadoEl: new Date().toISOString(),
    negocio: {
      nombre: tenant.name,
      rubro: tenant.vertical,
      plan: tenant.plan,
      clienteDesde: tenant.createdAt,
    },
    sedes: locations.map((location) => ({
      nombre: location.name,
      direccion: location.address,
      zonaHoraria: location.timezone,
    })),
    equipo: team.map((role) => ({
      nombre: role.user.name,
      email: role.user.email,
      sede: role.location.name,
      rol: role.role,
    })),
    profesionales: professionals.map((professional) => ({
      nombre: professional.name,
      bio: professional.bio,
      activo: professional.active,
      comisionPorcentaje: Number(professional.commissionRate),
    })),
    servicios: services.map((service) => ({
      nombre: service.name,
      duracionMinutos: service.durationMinutes,
      precio: Number(service.price),
      comisionOverridePorcentaje: service.commissionRate !== null ? Number(service.commissionRate) : null,
    })),
    clientes: clients.map((client) => ({
      nombre: client.name,
      email: client.email,
      telefono: client.phone,
      fechaNacimiento: client.birthdate,
      ficha: labelCustomFields(client.customFields),
      sellosDeLealtad: client.loyaltyStamps,
    })),
    citas: appointments.map((appointment) => ({
      cliente: appointment.client.name,
      servicio: appointment.service.name,
      profesional: appointment.professional.name,
      sede: appointment.location.name,
      fecha: appointment.startsAt,
      estado: APPOINTMENT_STATUS_LABELS[appointment.status],
      comisionPagada: appointment.commissionPaidAt !== null,
    })),
    inventario: inventoryItems.map((item) => ({
      nombre: item.name,
      unidad: item.unit,
      activo: item.active,
      costoUnitario: item.unitCost !== null ? Number(item.unitCost) : null,
      stockPorSede: item.stockLevels.map((stock) => ({ sede: stock.location.name, cantidad: stock.quantity })),
    })),
    paquetesDeSesiones: packages.map((pkg) => ({
      cliente: pkg.client.name,
      servicio: pkg.service?.name ?? "Paquete general",
      sesionesUsadas: pkg.usedSessions,
      sesionesTotales: pkg.totalSessions,
      compradoEl: pkg.purchasedAt,
      vence: pkg.expiresAt,
      estado: pkg.status,
    })),
    giftCards: giftCards.map((giftCard) => ({
      codigo: giftCard.code,
      montoInicial: Number(giftCard.initialAmount),
      saldo: Number(giftCard.balance),
      comprador: giftCard.purchaserName,
      destinatario: giftCard.recipientName,
      estado: giftCard.status,
      vence: giftCard.expiresAt,
    })),
    reseñas: reviews.map((review) => ({
      cliente: review.client.name,
      calificacion: review.rating,
      comentario: review.comment,
      visible: review.visible,
      enviadaEl: review.submittedAt,
    })),
  };

  const filename = `${tenant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-datos-completos.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
