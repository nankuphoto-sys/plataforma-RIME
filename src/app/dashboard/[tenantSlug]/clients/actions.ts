"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { normalizePhoneForWhatsapp } from "@/lib/whatsapp";
import {
  requireDashboardAccess,
  requireLoyaltyAccess,
  requirePackagesAccess,
  requirePackagesManageAccess,
  requirePhotosAccess,
  requirePrescriptionsAccess,
  requireWaitlistAccess,
} from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant, type StaffLocationRoleRecord } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import { getEffectiveClientFieldTemplate, type ClientFieldDefinition } from "@/lib/clientFieldTemplates";
import { canRedeemSession } from "@/lib/packages";
import { computeAvailableRewards } from "@/lib/loyalty";
import { ALLOWED_CLIENT_PHOTO_TYPES, MAX_CLIENT_PHOTO_BYTES, MAX_CLIENT_PHOTO_LABEL } from "@/lib/clientPhotos";

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

// Mismo email o mismo teléfono (comparado por dígitos, ignorando formato) ya
// pertenece a otro cliente del tenant. `excludeClientId` es el propio cliente
// al editar, para no compararlo contra sí mismo. El teléfono no se puede
// comparar en la query de Prisma (está guardado como texto libre, sin
// normalizar), así que se trae candidatos por tenant y se compara en JS.
async function findDuplicateClient(
  tenantId: string,
  email: string | null,
  phone: string | null,
  excludeClientId?: string
) {
  if (!email && !phone) return null;
  const normalizedPhone = phone ? normalizePhoneForWhatsapp(phone) : null;

  const candidates = await prisma.client.findMany({
    where: {
      tenantId,
      ...(excludeClientId ? { id: { not: excludeClientId } } : {}),
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(normalizedPhone ? [{ phone: { not: null } }] : []),
      ],
    },
    select: { id: true, name: true, email: true, phone: true },
  });

  return (
    candidates.find((c) => {
      const emailMatch = Boolean(email) && Boolean(c.email) && c.email!.toLowerCase() === email!.toLowerCase();
      const phoneMatch = Boolean(normalizedPhone) && Boolean(c.phone) && normalizePhoneForWhatsapp(c.phone!) === normalizedPhone;
      return emailMatch || phoneMatch;
    }) ?? null
  );
}

// Mismo criterio "solo lo mío" que updateClientAction y la página de detalle
// del cliente: un usuario "solo profesional" no puede actuar (redimir sesión,
// anotar en lista de espera, escribir receta, subir foto, canjear premio)
// sobre un cliente con el que no tiene ninguna cita, aunque adivine/pegue el
// id — las Server Actions se pueden invocar directo, sin pasar por la página
// que sí lo oculta. Devuelve null si el cliente no existe en el tenant o si
// está fuera del alcance del usuario.
async function findClientScopedToViewer(
  tenant: { id: string; locations: { id: string }[] },
  locationRoles: StaffLocationRoleRecord[],
  viewerUserId: string,
  clientId: string
) {
  const isProfessionalOnly = isProfessionalOnlyInTenant(
    locationRoles,
    tenant.locations.map((location) => location.id)
  );
  const viewerProfessionalId = isProfessionalOnly ? await getLinkedProfessionalId(viewerUserId) : null;

  return prisma.client.findFirst({
    where: {
      id: clientId,
      tenantId: tenant.id,
      ...(isProfessionalOnly
        ? { appointments: { some: { professionalId: viewerProfessionalId ?? "__sin-profesional-vinculado__" } } }
        : {}),
    },
  });
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

  const duplicate = await findDuplicateClient(tenant.id, email, phone);
  if (duplicate) {
    redirect(
      `/dashboard/${tenantSlug}/clients/new?error=${encodeURIComponent(
        `Ese email o teléfono ya pertenece a ${duplicate.name} — revisá si es la misma persona antes de crear un registro nuevo.`
      )}`
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

  const duplicate = await findDuplicateClient(tenant.id, email, phone, client.id);
  if (duplicate) {
    redirect(
      `/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent(
        `Ese email o teléfono ya pertenece a ${duplicate.name} — revisá si es la misma persona antes de guardar.`
      )}`
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

  const client = await findClientScopedToViewer(tenant, session.user.locationRoles, session.user.id, clientId);
  if (!client) notFound();

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

  // CAS contra usedSessions/status leídos arriba: dos redenciones concurrentes
  // del mismo paquete (dos personas en recepción a la vez) podrían leer el
  // mismo usedSessions antes de que cualquiera escriba, y la segunda pisaría
  // el update de la primera con el mismo valor absoluto — el paquete quedaría
  // con un PackageRedemption de más que lo que usedSessions refleja, dándole
  // al cliente una sesión de más gratis sin que quede detectable en el
  // contador. Si el CAS falla, se aborta antes de crear la redención.
  const claim = await prisma.sessionPackage.updateMany({
    where: { id: pkg.id, usedSessions: pkg.usedSessions, status: pkg.status },
    data: { usedSessions: nextUsedSessions, status: nextStatus },
  });
  if (claim.count === 0) {
    redirectWithError("Este paquete cambió justo ahora — probá de nuevo.");
    return;
  }

  await prisma.packageRedemption.create({
    data: { packageId: pkg.id, appointmentId, createdByUserId: session.user.id },
  });

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

// Canjear un premio de fidelidad ya ganado — solo incrementa el contador de
// canjeados, nunca toca loyaltyStamps (que es acumulado de por vida, ver
// src/lib/loyalty.ts). Re-valida server-side que de verdad haya un premio
// disponible: nunca confiar en que el botón solo aparece en la UI cuando
// corresponde.
export async function redeemLoyaltyRewardAction(tenantSlug: string, clientId: string): Promise<void> {
  const { session, tenant } = await requireLoyaltyAccess(tenantSlug);

  const client = await findClientScopedToViewer(tenant, session.user.locationRoles, session.user.id, clientId);
  if (!client) notFound();

  const availableRewards = computeAvailableRewards(
    client.loyaltyStamps,
    tenant.loyaltyStampsRequired,
    client.loyaltyRewardsRedeemed
  );
  if (availableRewards <= 0) {
    redirect(
      `/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent("Este cliente todavía no tiene un premio disponible.")}`
    );
  }

  // CAS contra loyaltyRewardsRedeemed leído arriba en vez de un increment
  // liso: aunque increment es atómico a nivel de fila, la VALIDACIÓN de
  // arriba (availableRewards > 0) sigue basada en una lectura vieja — dos
  // canjes concurrentes del mismo cliente con un solo premio disponible
  // podrían pasar ambos esa validación antes de que cualquiera escriba, y
  // los dos incrementos se sumarían igual, regalando un premio de más que el
  // cliente no ganó. El CAS hace que el segundo aborte en vez de aplicarse.
  const claim = await prisma.client.updateMany({
    where: { id: client.id, loyaltyRewardsRedeemed: client.loyaltyRewardsRedeemed },
    data: { loyaltyRewardsRedeemed: client.loyaltyRewardsRedeemed + 1 },
  });
  if (claim.count === 0) {
    redirect(
      `/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent("Este cliente cambió justo ahora — probá de nuevo.")}`
    );
  }

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}

// Anotar a un cliente en la lista de espera de un servicio: cualquiera con
// acceso al dashboard (no exige OWNER/ADMIN, mismo criterio que redimir una
// sesión de paquete) — es una tarea del día a día de recepción.
export async function createWaitlistEntryAction(
  tenantSlug: string,
  clientId: string,
  formData: FormData
): Promise<void> {
  const { session, tenant } = await requireWaitlistAccess(tenantSlug);

  const client = await findClientScopedToViewer(tenant, session.user.locationRoles, session.user.id, clientId);
  if (!client) notFound();

  const redirectWithError = (error: string) => {
    redirect(`/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent(error)}`);
  };

  const locationId = formData.get("locationId")?.toString() ?? "";
  const serviceId = formData.get("serviceId")?.toString() ?? "";
  const professionalIdRaw = formData.get("professionalId")?.toString().trim() ?? "";
  const preferredFromRaw = formData.get("preferredFrom")?.toString().trim() ?? "";
  const preferredToRaw = formData.get("preferredTo")?.toString().trim() ?? "";

  // Nunca confiar en los ids que llegan del formulario: sede y servicio
  // deben pertenecer a este tenant, y el profesional (si se eligió uno
  // puntual) también.
  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: tenant.id } });
  if (!location) {
    redirectWithError("Sede no válida.");
    return;
  }
  const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId: tenant.id } });
  if (!service) {
    redirectWithError("Servicio no válido.");
    return;
  }
  let professionalId: string | null = null;
  if (professionalIdRaw) {
    const professional = await prisma.professional.findFirst({
      where: { id: professionalIdRaw, tenantId: tenant.id },
    });
    if (!professional) {
      redirectWithError("Profesional no válido.");
      return;
    }
    professionalId = professional.id;
  }

  const preferredFrom = preferredFromRaw ? new Date(preferredFromRaw) : null;
  const preferredTo = preferredToRaw ? new Date(preferredToRaw) : null;
  if ((preferredFrom && Number.isNaN(preferredFrom.getTime())) || (preferredTo && Number.isNaN(preferredTo.getTime()))) {
    redirectWithError("La ventana de fechas preferida no es válida.");
    return;
  }

  await prisma.waitlistEntry.create({
    data: {
      tenantId: tenant.id,
      locationId: location.id,
      clientId: client.id,
      serviceId: service.id,
      professionalId,
      preferredFrom,
      preferredTo,
      createdByUserId: session.user.id,
    },
  });

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}

// Sacar a un cliente de la lista de espera (se arrepintió, ya reservó por
// otro lado, etc.). Nunca se borra — status pasa a CANCELLED, mismo criterio
// que el resto del proyecto. Se puede cancelar desde WAITING o NOTIFIED (ya
// se le avisó de un cupo pero no lo tomó) — no desde BOOKED (ya se resolvió
// solo) ni desde otra CANCELLED (no-op sin sentido).
export async function cancelWaitlistEntryAction(
  tenantSlug: string,
  clientId: string,
  entryId: string
): Promise<void> {
  const { session, tenant } = await requireWaitlistAccess(tenantSlug);

  const client = await findClientScopedToViewer(tenant, session.user.locationRoles, session.user.id, clientId);
  if (!client) notFound();

  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: entryId, tenantId: tenant.id, clientId },
  });
  if (!entry) notFound();

  if (entry.status !== "WAITING" && entry.status !== "NOTIFIED") {
    redirect(
      `/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent("Ese registro de lista de espera ya no se puede cancelar.")}`
    );
  }

  await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: "CANCELLED" } });

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}

// Escribir una receta/nota clínica para un cliente: cualquiera con acceso al
// dashboard (no exige OWNER/ADMIN) — es exactamente el trabajo clínico de un
// profesional. appointmentId es opcional, solo para trazabilidad de qué
// visita la originó. Nunca se edita ni se borra una vez creada (registro
// clínico) — solo se puede agregar una nota nueva.
export async function createPrescriptionAction(
  tenantSlug: string,
  clientId: string,
  formData: FormData
): Promise<void> {
  const { session, tenant } = await requirePrescriptionsAccess(tenantSlug);

  const client = await findClientScopedToViewer(tenant, session.user.locationRoles, session.user.id, clientId);
  if (!client) notFound();

  const redirectWithError = (error: string) => {
    redirect(`/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent(error)}`);
  };

  const professionalId = formData.get("professionalId")?.toString() ?? "";
  const title = formData.get("title")?.toString().trim() || null;
  const content = formData.get("content")?.toString().trim() ?? "";
  const appointmentIdRaw = formData.get("appointmentId")?.toString().trim() ?? "";

  if (!content) {
    redirectWithError("El contenido de la receta no puede estar vacío.");
    return;
  }

  // Nunca confiar en los ids que llegan del formulario: el profesional debe
  // pertenecer a este tenant, y la cita (si se eligió una) a este tenant Y
  // este cliente puntual.
  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
  });
  if (!professional) {
    redirectWithError("Profesional no válido.");
    return;
  }

  let appointmentId: string | null = null;
  if (appointmentIdRaw) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentIdRaw, tenantId: tenant.id, clientId },
    });
    if (!appointment) {
      redirectWithError("La cita seleccionada no es válida.");
      return;
    }
    appointmentId = appointment.id;
  }

  await prisma.prescription.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      professionalId: professional.id,
      appointmentId,
      title,
      content,
      createdByUserId: session.user.id,
    },
  });

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}

// Subir una foto de seguimiento para la línea de tiempo de un cliente:
// cualquiera con acceso al dashboard (no exige OWNER/ADMIN, mismo criterio
// que redimir una sesión de paquete). A diferencia de la foto de perfil
// (User.image, base64 en Postgres — válido para una sola foto chica), acá
// puede haber muchas fotos por cliente, así que el archivo va a un servicio
// de almacenamiento real (Vercel Blob) y solo se guarda la URL resultante.
export async function uploadClientPhotoAction(
  tenantSlug: string,
  clientId: string,
  formData: FormData
): Promise<void> {
  const { session, tenant } = await requirePhotosAccess(tenantSlug);

  const client = await findClientScopedToViewer(tenant, session.user.locationRoles, session.user.id, clientId);
  if (!client) notFound();

  const redirectWithError = (error: string) => {
    redirect(`/dashboard/${tenantSlug}/clients/${clientId}?error=${encodeURIComponent(error)}`);
  };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    redirectWithError("Elegí una foto para subir.");
    return;
  }
  if (!ALLOWED_CLIENT_PHOTO_TYPES.has(file.type)) {
    redirectWithError("La foto debe ser JPG, PNG o WEBP.");
    return;
  }
  if (file.size > MAX_CLIENT_PHOTO_BYTES) {
    redirectWithError(`La foto no puede pesar más de ${MAX_CLIENT_PHOTO_LABEL}.`);
    return;
  }

  const caption = formData.get("caption")?.toString().trim() || null;

  // Sin BLOB_READ_WRITE_TOKEN configurado, put() tira — se atrapa acá para
  // dar un mensaje claro en vez de un error 500 genérico, mismo criterio que
  // sendWhatsAppMessage/sendPasswordResetEmail ante un servicio externo sin
  // configurar. A diferencia de esos, acá SÍ hace falta interrumpir el flujo
  // (no hay nada útil que guardar sin una URL real del archivo).
  let url: string;
  try {
    const blob = await put(`client-photos/${tenant.id}/${clientId}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    url = blob.url;
  } catch {
    redirectWithError(
      "No se pudo subir la foto — el almacenamiento de archivos no está configurado todavía. Contactá a soporte."
    );
    return;
  }

  await prisma.clientPhoto.create({
    data: { tenantId: tenant.id, clientId: client.id, url, caption, createdByUserId: session.user.id },
  });

  revalidatePath(`/dashboard/${tenantSlug}/clients/${clientId}`);
  redirect(`/dashboard/${tenantSlug}/clients/${clientId}?saved=1`);
}
