"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { Prisma, type Plan, type TenantVertical } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_TIMEZONE = "America/Bogota";
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLANS: readonly Plan[] = ["INDIVIDUAL", "BASICO", "PREMIUM", "PRO"];
const VALID_VERTICALS: readonly TenantVertical[] = [
  "GENERAL",
  "PSICOLOGIA",
  "NUTRICION",
  "FISIOTERAPIA",
  "ESTETICA",
];

function isValidPlan(value: string): value is Plan {
  return (VALID_PLANS as readonly string[]).includes(value);
}

function isValidVertical(value: string): value is TenantVertical {
  return (VALID_VERTICALS as readonly string[]).includes(value);
}

// Rango Unicode de marcas diacríticas combinantes (U+0300 a U+036F), armado
// vía fromCharCode para evitar escapes \\u ambiguos en el fuente.
const COMBINING_MARKS_PATTERN = new RegExp(
  `[${String.fromCharCode(768)}-${String.fromCharCode(879)}]`,
  "g"
);

// Slugify básico: minúsculas, sin acentos, espacios/símbolos a guiones.
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Si el slug base ya existe, agrega un sufijo numérico incremental hasta
// encontrar uno libre — detalle interno, nunca falla el signup por esto.
async function generateUniqueSlug(businessName: string): Promise<string> {
  const base = slugify(businessName) || "negocio";
  let candidate = base;
  let suffix = 2;
  while (await prisma.tenant.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function signUpTenantAction(formData: FormData): Promise<void> {
  const businessName = formData.get("businessName")?.toString().trim() ?? "";
  const vertical = formData.get("vertical")?.toString() ?? "";
  const plan = formData.get("plan")?.toString() ?? "";
  const ownerName = formData.get("ownerName")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const passwordConfirmation = formData.get("passwordConfirmation")?.toString() ?? "";
  const locationName = formData.get("locationName")?.toString().trim() ?? "";
  const timezone = formData.get("timezone")?.toString().trim() || DEFAULT_TIMEZONE;

  if (!businessName || !ownerName || !email || !password || !locationName) {
    redirect(`/signup?error=${encodeURIComponent("Todos los campos son obligatorios.")}`);
  }
  if (!EMAIL_FORMAT.test(email)) {
    redirect(`/signup?error=${encodeURIComponent("El correo no tiene un formato válido.")}`);
  }
  if (password.length < 8) {
    redirect(
      `/signup?error=${encodeURIComponent("La contraseña debe tener al menos 8 caracteres.")}`
    );
  }
  if (password !== passwordConfirmation) {
    redirect(`/signup?error=${encodeURIComponent("Las contraseñas no coinciden.")}`);
  }
  if (!isValidPlan(plan)) {
    redirect(`/signup?error=${encodeURIComponent("Selecciona un plan válido.")}`);
  }
  if (!isValidVertical(vertical)) {
    redirect(`/signup?error=${encodeURIComponent("Selecciona un rubro válido.")}`);
  }

  // User.email es único globalmente (un usuario nunca pertenece a más de un
  // tenant), no hace falta chequear tenant.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    redirect(
      `/signup?error=${encodeURIComponent("Ese correo ya tiene una cuenta. Inicia sesión en vez de registrarte.")}`
    );
  }

  const slug = await generateUniqueSlug(businessName);
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: businessName, slug, plan, vertical, status: "TRIAL" },
      });
      const location = await tx.location.create({
        data: { tenantId: tenant.id, name: locationName, timezone },
      });
      const user = await tx.user.create({
        data: { tenantId: tenant.id, name: ownerName, email, passwordHash },
      });
      await tx.staffLocationRole.create({
        data: { userId: user.id, locationId: location.id, role: "OWNER" },
      });
    });
  } catch (err) {
    // El chequeo de existingUser (arriba) y de slug libre (generateUniqueSlug)
    // quedan afuera de esta misma transacción, así que un doble submit (doble
    // click, reintento de red) puede colar dos requests que pasen ambos esos
    // chequeos antes de que cualquiera escriba — sin este catch, la segunda
    // transacción rompía el @unique de User.email o Tenant.slug y el usuario
    // veía la pantalla de error genérica de Next.js en vez de un mensaje
    // entendible.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? (err.meta.target as string[]) : [];
      const message = target.includes("email")
        ? "Ese correo ya tiene una cuenta. Inicia sesión en vez de registrarte."
        : "Ya existe un negocio con ese nombre — probá con otro.";
      redirect(`/signup?error=${encodeURIComponent(message)}`);
    }
    throw err;
  }

  redirect("/login?signup=success");
}
