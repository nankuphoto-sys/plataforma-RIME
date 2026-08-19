import type { Plan, TenantVertical } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectiveClientFieldTemplate } from "@/lib/clientFieldTemplates";
import { decryptCustomFields } from "@/lib/clientCustomFields";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";

// Forma mínima de Tenant que necesita buildTenantExportPayload — tanto
// requireOwnerAccess (usado por el route handler de "Descargar mis datos")
// como el cron de backups (que trae tenants directo con prisma.tenant.findMany)
// calzan con esto sin conversión extra.
export interface TenantExportSource {
  id: string;
  name: string;
  vertical: TenantVertical;
  plan: Plan;
  createdAt: Date;
}

// Arma el JSON completo de export de un tenant (todo su negocio: sedes,
// equipo, profesionales, servicios, clientes, citas, inventario, paquetes,
// gift cards, reseñas). Extraído de
// src/app/dashboard/[tenantSlug]/account/export/route.ts (el botón
// "Descargar mis datos" de Mi cuenta) para que el cron de backups
// automáticos (src/app/api/cron/backup-tenants/route.ts) pueda reusar
// exactamente la misma lógica de armado sin duplicarla — mismo criterio de
// "etiquetas legibles, no keys internas" en todos los campos.
export async function buildTenantExportPayload(tenant: TenantExportSource) {
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
  // campo, no la key camelCase interna. customFields llega cifrado en la
  // base (ver clientCustomFields.ts) — decryptCustomFields lo descifra y
  // nunca lanza (ciphertext corrupto/con otra clave -> ficha vacía).
  const labelCustomFields = (customFields: unknown): Record<string, unknown> => {
    const raw = decryptCustomFields(customFields);
    return Object.fromEntries(
      fieldTemplate.filter((field) => field.key in raw).map((field) => [field.label, raw[field.key]])
    );
  };

  return {
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
}

// Nombre de archivo consistente para el JSON exportado de un tenant (usado
// tanto por la descarga manual como, con otro sufijo, por el cron de
// backups).
export function tenantExportFilenameBase(tenant: Pick<TenantExportSource, "name">): string {
  return tenant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
