import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Compartido entre el signup por Credentials (src/app/signup/actions.ts) y
// el aprovisionamiento automático de "Registrarte con Google" (src/lib/auth.ts)
// — antes vivía duplicado solo en signup/actions.ts.
export const DEFAULT_TIMEZONE = "America/Bogota";

// Rango Unicode de marcas diacríticas combinantes (U+0300 a U+036F), armado
// vía fromCharCode para evitar escapes \\u ambiguos en el fuente.
const COMBINING_MARKS_PATTERN = new RegExp(
  `[${String.fromCharCode(768)}-${String.fromCharCode(879)}]`,
  "g"
);

// Slugify básico: minúsculas, sin acentos, espacios/símbolos a guiones.
export function slugify(value: string): string {
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
export async function generateUniqueSlug(businessName: string): Promise<string> {
  const base = slugify(businessName) || "negocio";
  let candidate = base;
  let suffix = 2;
  while (await prisma.tenant.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

// Subset de los campos de `account` que Auth.js pasa al callback `signIn`
// para un provider OAuth (ver src/lib/auth.ts) — solo los que hace falta
// guardar en el Account de Prisma.
export interface OAuthAccountLike {
  type: string;
  provider: string;
  providerAccountId: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

// Aprovisiona un negocio de prueba completo (Tenant + Location + User +
// StaffLocationRole OWNER + Account) para un login de OAuth (hoy solo
// Google) con un email que todavía no existe como User — usado por el
// signIn callback de src/lib/auth.ts cuando alguien usa "Registrarte con
// Google". El Account se crea con el MISMO provider/providerAccountId que
// Auth.js va a buscar después vía getUserByAccount, para que su propio
// flujo de creación de usuario (que rompería contra el tenantId NOT NULL)
// nunca se dispare — ver el comentario largo en auth.ts para el detalle
// completo de por qué esto es necesario.
//
// Nombre/rubro/plan del negocio son genéricos a propósito (el dueño los
// edita después desde Configuración) — alcance elegido explícitamente en
// vez de un formulario de dos pasos.
export async function provisionTenantForOAuthUser(params: {
  email: string;
  name: string;
  image?: string | null;
  account: OAuthAccountLike;
}): Promise<void> {
  const { email, name, image, account } = params;
  const businessName = `Negocio de ${name}`;
  const slug = await generateUniqueSlug(businessName);

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: businessName, slug, plan: "INDIVIDUAL", vertical: "GENERAL", status: "TRIAL" },
      });
      const location = await tx.location.create({
        data: { tenantId: tenant.id, name: "Sede Principal", timezone: DEFAULT_TIMEZONE },
      });
      const newUser = await tx.user.create({
        data: { tenantId: tenant.id, name, email, passwordHash: null, image: image ?? null },
      });
      await tx.staffLocationRole.create({
        data: { userId: newUser.id, locationId: location.id, role: "OWNER" },
      });
      await tx.account.create({
        data: {
          userId: newUser.id,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          access_token: account.access_token ?? null,
          refresh_token: account.refresh_token ?? null,
          expires_at: account.expires_at ?? null,
          token_type: account.token_type ?? null,
          scope: account.scope ?? null,
          id_token: account.id_token ?? null,
          session_state: account.session_state ?? null,
        },
      });
    });
  } catch (err) {
    // Carrera entre dos requests con el mismo email nuevo (doble clic, dos
    // pestañas): el segundo choca contra el @unique de User.email — no es
    // un error real, el otro ya lo creó todo.
    const isDuplicateEmail =
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      Array.isArray(err.meta?.target) &&
      (err.meta.target as string[]).includes("email");
    if (!isDuplicateEmail) throw err;
  }
}
