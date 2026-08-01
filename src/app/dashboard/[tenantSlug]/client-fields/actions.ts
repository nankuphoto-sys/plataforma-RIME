"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CustomClientFieldType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireClientFieldsManageAccess } from "@/lib/auth-guards";
import { getClientFieldTemplate } from "@/lib/clientFieldTemplates";

const VALID_TYPES: readonly CustomClientFieldType[] = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "DATE",
  "SELECT",
  "BOOLEAN",
];

function isValidType(value: string): value is CustomClientFieldType {
  return (VALID_TYPES as readonly string[]).includes(value);
}

// Mismo patrón de normalización que slugify() en signup/actions.ts
// (duplicado a propósito, ver convención del proyecto de preferir
// duplicación mínima entre módulos), pero con "_" en vez de "-" porque el
// resultado es una key de JSON, no un slug de URL.
const COMBINING_MARKS_PATTERN = new RegExp(
  `[${String.fromCharCode(768)}-${String.fromCharCode(879)}]`,
  "g"
);

function generateFieldKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseOptions(formData: FormData): string[] {
  const raw = formData.get("options")?.toString() ?? "";
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function createClientFieldAction(tenantSlug: string, formData: FormData): Promise<void> {
  const { tenant } = await requireClientFieldsManageAccess(tenantSlug);

  const newPath = `/dashboard/${tenantSlug}/client-fields/new`;

  const label = formData.get("label")?.toString().trim() ?? "";
  const type = formData.get("type")?.toString() ?? "";

  if (!label) {
    redirect(`${newPath}?error=${encodeURIComponent("El nombre es obligatorio.")}`);
  }
  if (!isValidType(type)) {
    redirect(`${newPath}?error=${encodeURIComponent("Selecciona un tipo de campo válido.")}`);
  }

  let options: string[] | undefined;
  if (type === "SELECT") {
    options = parseOptions(formData);
    if (options.length === 0) {
      redirect(
        `${newPath}?error=${encodeURIComponent("Los campos de tipo lista necesitan al menos una opción.")}`
      );
    }
  }

  const key = generateFieldKey(label);
  if (!key) {
    redirect(
      `${newPath}?error=${encodeURIComponent("El nombre no genera una clave válida, probá con otro.")}`
    );
  }

  const fixedTemplate = getClientFieldTemplate(tenant.vertical);
  if (fixedTemplate.some((field) => field.key === key)) {
    redirect(
      `${newPath}?error=${encodeURIComponent(
        "Ya existe un campo de la ficha con esa clave (uno fijo de tu rubro). Probá con otro nombre."
      )}`
    );
  }

  const existing = await prisma.tenantClientField.findUnique({
    where: { tenantId_key: { tenantId: tenant.id, key } },
  });
  if (existing) {
    const message = existing.active
      ? "Ya existe un campo personalizado con esa clave. Probá con otro nombre."
      : "Ya existe un campo personalizado (desactivado) con esa clave. Reactivalo en vez de crear uno nuevo.";
    redirect(`${newPath}?error=${encodeURIComponent(message)}`);
  }

  const lastField = await prisma.tenantClientField.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { order: "desc" },
  });
  const order = lastField ? lastField.order + 1 : 0;

  await prisma.tenantClientField.create({
    data: { tenantId: tenant.id, key, label, type, options, order },
  });

  revalidatePath(`/dashboard/${tenantSlug}/client-fields`);
  redirect(`/dashboard/${tenantSlug}/client-fields`);
}

export async function updateClientFieldAction(
  tenantSlug: string,
  fieldId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireClientFieldsManageAccess(tenantSlug);

  const field = await prisma.tenantClientField.findFirst({
    where: { id: fieldId, tenantId: tenant.id },
  });
  if (!field) notFound();

  const detailPath = `/dashboard/${tenantSlug}/client-fields/${fieldId}`;

  const label = formData.get("label")?.toString().trim() ?? "";
  const active = formData.get("active") === "on";

  if (!label) {
    redirect(`${detailPath}?error=${encodeURIComponent("El nombre es obligatorio.")}`);
  }

  let options: string[] | undefined;
  if (field.type === "SELECT") {
    options = parseOptions(formData);
    if (options.length === 0) {
      redirect(
        `${detailPath}?error=${encodeURIComponent("Los campos de tipo lista necesitan al menos una opción.")}`
      );
    }
  }

  await prisma.tenantClientField.update({
    where: { id: field.id },
    data: { label, options, active },
  });

  revalidatePath(`/dashboard/${tenantSlug}/client-fields/${fieldId}`);
  revalidatePath(`/dashboard/${tenantSlug}/client-fields`);
  redirect(`${detailPath}?saved=1`);
}
