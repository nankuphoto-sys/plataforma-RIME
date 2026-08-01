"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
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
  const { tenant } = await requireDashboardAccess(tenantSlug);

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
  const { tenant } = await requireDashboardAccess(tenantSlug);

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: tenant.id },
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
