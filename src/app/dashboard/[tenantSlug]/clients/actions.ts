"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import { getEffectiveClientFieldTemplate, type ClientFieldDefinition } from "@/lib/clientFieldTemplates";

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
