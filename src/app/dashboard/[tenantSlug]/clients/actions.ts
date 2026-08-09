"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess, requirePackagesAccess, requirePackagesManageAccess } from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import { getEffectiveClientFieldTemplate, type ClientFieldDefinition } from "@/lib/clientFieldTemplates";
import { canRedeemSession } from "@/lib/packages";

// Arma customFields solo a partir de las keys de la plantilla del tenant —
// cualquier otra cosa que llegue en el FormData se ignora, para no permitir
// inyectar campos arbitrarios en el JSON.
function buildCustomFields(
  formData: FormData,
  fieldTemplate: ClientFieldDefinition[]
): Record<string, string | number | boolean | null> {
  const customFields: Record<string, string | number | boolean | null> = {};

  for (const field of fieldTemplate) {
    if (field.type === "boolean") {
      customFields[field.key] = formData.get(field.key) === "on";
      continue;
    }

    const raw = formData.get(field.key)?.toString().trim();
    if (!raw) {
      customFields[field.key] = null;
      continue;
    }

    customFields[field.key] = field.type === "number" ? Number(raw) : raw;
  }

  return customFields;
}

function parseBaseFields(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim() || null;
  const phone = formData.get("phone")?.toString().trim() || null;
  const birthdateRaw = formData.get("birthdate")?.toString().trim();
  const birthdate = birthdateRaw ? new Date(birthdateRaw) : null;
  return { name, email, phone, birthdate };
}

export async function createClientAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  // Un usuario "solo profesional" (nunca OWNER/ADMIN/STAFF en ninguna sede)
  // ve el CRM filtrado a "sus" clientes (con los que ya tiene una cita) — si
  // pudiera crear uno nuevo, quedaría invisible para él mismo hasta tener una
  // cita, un callejón sin salida confuso. Crear clientes queda para
  // recepción/administración, igual que gestionar profesionales/sedes/
  // servicios. La UI ya oculta el link "+ Nuevo cliente"; esto es el mismo
  // chequeo re-verificado server-side, por si se fuerza la ruta a mano.
  const isProfessionalOnly = isProfessionalOnlyInTenant(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id)
  );
  if (isProfessionalOnly) {
    redirect(
      `/dashboard/${tenantSlug}/clients?error=${encodeURIComponent(
        "No tenés permiso para crear clientes nuevos. Pedile a recepción o a tu administrador que lo haga."
      )}`
    );
  }

  const { name, email, phone, birthdate } = parseBaseFields(formData);
  if (!name) {
    redirect(
      `/dashboard/${tenantSlug}/clients/new?error=${encodeURIComponent("El nombre es obligatorio.")}`
    );
  }

  const fieldTemplate = await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical);
  const customFields = buildCustomFields(formData, fieldTemplate);

  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name, email, phone, birthdate, customFields },
  });

  revalidatePath(`/dashboard/${tenantSlug}/clients`);
  redirect(`/dashboard/${tenantSlug}/clients/${client.id}`);
}

export async function updateClientAction(
  tenantSlug: string,
  clientId: string,
  formData: FormData
): Promise<void> {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  // Mismo criterio "solo lo mío" que la página de detalle: un usuario "solo
  // profesional" no puede editar un cliente con el que no tiene ninguna
  // cita, aunque adivine el id en la URL — nunca confiar solo en que la UI
  // ya lo ocultó.
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

  const { name, email, phone, birthdate } = parseBaseFields(formData);
  if (!name) {
    redirect(
      `/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent("El nombre es obligatorio.")}`
    );
  }

  const fieldTemplate = await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical);
  const customFields = buildCustomFields(formData, fieldTemplate);

  await prisma.client.update({
    where: { id: client.id },
    data: { name, email, phone, birthdate, customFields },
  });

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  revalidatePath(`/dashboard/${tenantSlug}/clients`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}

// Vender un paquete nuevo a un cliente: OWNER/ADMIN, mismo criterio que crear
// un ítem de inventario — es configuración/venta del negocio, no una tarea
// de recepción del día a día (a diferencia de redimir una sesión, que sí
// puede hacer cualquiera con acceso al dashboard).
export async function createPackageAction(
  tenantSlug: string,
  clientId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requirePackagesManageAccess(tenantSlug);

  const client = await prisma.client.findFirst({ where: { id: clientId, tenantId: tenant.id } });
  if (!client) notFound();

  const redirectWithError = (error: string) => {
    redirect(`/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent(error)}`);
  };

  const totalSessionsRaw = formData.get("totalSessions")?.toString().trim() ?? "";
  const totalSessions = Number.parseInt(totalSessionsRaw, 10);
  if (!Number.isFinite(totalSessions) || totalSessions <= 0) {
    redirectWithError("La cantidad de sesiones debe ser un número mayor a 0.");
    return;
  }

  const priceRaw = formData.get("price")?.toString().trim() ?? "";
  const price = priceRaw === "" ? null : Number(priceRaw);
  if (price !== null && (Number.isNaN(price) || price < 0)) {
    redirectWithError("El precio debe ser un número mayor o igual a 0, o dejarse vacío.");
    return;
  }

  const expiresAtRaw = formData.get("expiresAt")?.toString().trim() ?? "";
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    redirectWithError("La fecha de vencimiento no es válida.");
    return;
  }

  const serviceIdRaw = formData.get("serviceId")?.toString().trim() ?? "";
  let serviceId: string | null = null;
  if (serviceIdRaw) {
    // Nunca confiar en el id que llega del formulario: validamos que el
    // servicio pertenezca a este tenant.
    const service = await prisma.service.findFirst({ where: { id: serviceIdRaw, tenantId: tenant.id } });
    if (!service) {
      redirectWithError("Servicio no válido.");
      return;
    }
    serviceId = service.id;
  }

  await prisma.sessionPackage.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      serviceId,
      totalSessions,
      price,
      expiresAt,
    },
  });

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}

// Redimir 1 sesión de un paquete: cualquiera con acceso al dashboard (no
// exige OWNER/ADMIN) — igual que registrar un movimiento de inventario, es
// una tarea del día a día de recepción. appointmentId es opcional, solo para
// trazabilidad de qué visita usó la sesión; nunca dispara nada solo (ver
// src/lib/packages.ts).
export async function redeemPackageSessionAction(
  tenantSlug: string,
  clientId: string,
  packageId: string,
  formData: FormData
): Promise<void> {
  const { session, tenant } = await requirePackagesAccess(tenantSlug);

  const redirectWithError = (error: string) => {
    redirect(`/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent(error)}`);
  };

  // Nunca confiar en los ids de la URL/formulario: el paquete debe
  // pertenecer a este tenant Y a este cliente puntual.
  const pkg = await prisma.sessionPackage.findFirst({
    where: { id: packageId, tenantId: tenant.id, clientId },
  });
  if (!pkg) notFound();

  if (!canRedeemSession(pkg)) {
    redirectWithError("Este paquete no tiene sesiones disponibles para redimir.");
    return;
  }

  const appointmentIdRaw = formData.get("appointmentId")?.toString().trim() ?? "";
  let appointmentId: string | null = null;
  if (appointmentIdRaw) {
    // Solo se puede vincular a una cita COMPLETED de este mismo cliente que
    // todavía no tenga otra redención asociada (appointmentId es @unique en
    // PackageRedemption).
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentIdRaw,
        tenantId: tenant.id,
        clientId,
        status: "COMPLETED",
        packageRedemption: null,
      },
    });
    if (!appointment) {
      redirectWithError("La cita seleccionada no es válida para vincular esta redención.");
      return;
    }
    appointmentId = appointment.id;
  }

  const nextUsedSessions = pkg.usedSessions + 1;
  const nextStatus = nextUsedSessions >= pkg.totalSessions ? "COMPLETED" : pkg.status;

  await prisma.$transaction([
    prisma.sessionPackage.update({
      where: { id: pkg.id },
      data: { usedSessions: nextUsedSessions, status: nextStatus },
    }),
    prisma.packageRedemption.create({
      data: { packageId: pkg.id, appointmentId, createdByUserId: session.user.id },
    }),
  ]);

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}

// Cancelar un paquete: OWNER/ADMIN, mismo criterio que crearlo. Nunca se
// borra — status pasa a CANCELLED, mismo criterio que Profesionales/Sedes/
// Inventario. Solo se puede cancelar un paquete ACTIVE (uno ya COMPLETED o
// CANCELLED se deja como está, sin re-disparar nada).
export async function cancelPackageAction(
  tenantSlug: string,
  clientId: string,
  packageId: string
): Promise<void> {
  const { tenant } = await requirePackagesManageAccess(tenantSlug);

  const pkg = await prisma.sessionPackage.findFirst({
    where: { id: packageId, tenantId: tenant.id, clientId },
  });
  if (!pkg) notFound();

  if (pkg.status !== "ACTIVE") {
    redirect(
      `/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent("Solo se pueden cancelar paquetes activos.")}`
    );
  }

  await prisma.sessionPackage.update({ where: { id: pkg.id }, data: { status: "CANCELLED" } });

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}
