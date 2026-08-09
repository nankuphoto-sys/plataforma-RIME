import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAnyOfRolesInTenantLocations, hasAnyRoleInTenantLocations } from "@/lib/authorization";
import { planIncludesModule } from "@/lib/planLimits";

// Guard de acceso para la agenda interna (src/app/dashboard/[tenantSlug]).
// Reglas, en orden:
//   1. Sin sesión -> /login.
//   2. Tenant de la URL no existe -> 404.
//   3. El tenant del usuario logueado no es el de la URL -> 404 (no revelar
//      que el tenant existe).
//   4. Tenant con status PAST_DUE o CANCELLED -> /account-locked (bloqueo
//      duro de todo el dashboard interno; la agenda pública de reservas no
//      pasa por este guard y sigue funcionando igual).
//   5. El usuario no tiene ningún StaffLocationRole en ninguna location de
//      este tenant -> 404.
// Ya autorizado el acceso a la vista, devuelve el tenant (con sus locations
// y profesionales activos) para que la página no tenga que volver a
// consultarlo.
export async function requireDashboardAccess(tenantSlug: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      locations: true,
      professionals: { where: { active: true }, orderBy: { name: "asc" } },
    },
  });
  if (!tenant) notFound();

  if (session.user.tenantId !== tenant.id) notFound();

  if (tenant.status === "PAST_DUE" || tenant.status === "CANCELLED") {
    redirect(`/dashboard/${tenantSlug}/account-locked`);
  }

  const hasAccess = hasAnyRoleInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id)
  );
  if (!hasAccess) notFound();

  return { session, tenant };
}

// Guard de acceso para reportes (src/app/dashboard/[tenantSlug]/reports):
// exige que el plan del tenant incluya el módulo "reports" (si no, manda a
// /plan-required) y además rol OWNER o ADMIN — un STAFF o PROFESSIONAL no
// debe poder ver ingresos ni comisiones del negocio. 404 en vez de 403 para
// no revelar que la página existe.
export async function requireReportsAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  if (!planIncludesModule(tenant.plan, "reports")) {
    redirect(`/dashboard/${tenantSlug}/plan-required?feature=reportes&requiredPlan=BASICO`);
  }

  const hasReportsAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );
  if (!hasReportsAccess) notFound();

  return { session, tenant };
}

// Guard de acceso para gestión de sedes (src/app/dashboard/[tenantSlug]/locations):
// solo OWNER — a diferencia de reportes, un ADMIN no debe poder crear/editar
// sedes ni reasignar profesionales. 404 en vez de 403.
export async function requireOwnerAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  const hasOwnerAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER"]
  );
  if (!hasOwnerAccess) notFound();

  return { session, tenant };
}

// Guard de acceso al módulo de inventario (ver stock/movimientos y
// registrarlos): exige que el plan del tenant incluya "inventory" (si no,
// manda a /plan-required). Cualquier usuario con acceso al dashboard puede
// usarlo — el rol OWNER/ADMIN para gestionar el catálogo se exige aparte en
// requireInventoryManageAccess, por debajo de este chequeo de plan.
export async function requireInventoryAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  if (!planIncludesModule(tenant.plan, "inventory")) {
    redirect(`/dashboard/${tenantSlug}/plan-required?feature=inventario&requiredPlan=PREMIUM`);
  }

  return { session, tenant };
}

// Guard de acceso al módulo de paquetes/bonos de sesiones (ver/crear/redimir
// desde la ficha de un cliente): exige que el plan del tenant incluya
// "packages" (si no, manda a /plan-required), mismo patrón que
// requireInventoryAccess. Cualquier usuario con acceso al dashboard puede
// ver y redimir sesiones — crear un paquete nuevo exige además OWNER/ADMIN,
// verificado aparte en la Server Action (mismo split que Inventario:
// requireInventoryAccess vs requireInventoryManageAccess).
export async function requirePackagesAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  if (!planIncludesModule(tenant.plan, "packages")) {
    redirect(`/dashboard/${tenantSlug}/plan-required?feature=paquetes&requiredPlan=PREMIUM`);
  }

  return { session, tenant };
}

// Guard de acceso a la lista de espera (unirse, ver la propia, cancelar):
// exige que el plan del tenant incluya "waitlist", mismo patrón que
// requirePackagesAccess. Sin split de manage-access — a diferencia de
// paquetes, anotar o sacar a alguien de la lista de espera no mueve plata,
// así que cualquier usuario con acceso al dashboard puede hacerlo (mismo
// criterio que registrar un movimiento de inventario).
export async function requireWaitlistAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  if (!planIncludesModule(tenant.plan, "waitlist")) {
    redirect(`/dashboard/${tenantSlug}/plan-required?feature=lista-de-espera&requiredPlan=PREMIUM`);
  }

  return { session, tenant };
}

// Guard de acceso para gestionar paquetes (crear uno nuevo, cancelarlo):
// además del chequeo de plan de requirePackagesAccess, exige OWNER o ADMIN,
// mismo criterio que requireInventoryManageAccess. Ver los paquetes de un
// cliente y redimir una sesión NO usa este guard — alcanza con
// requirePackagesAccess (cualquiera con acceso al dashboard).
export async function requirePackagesManageAccess(tenantSlug: string) {
  const { session, tenant } = await requirePackagesAccess(tenantSlug);

  const hasPackagesManageAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );
  if (!hasPackagesManageAccess) notFound();

  return { session, tenant };
}

// Guard de acceso para gestionar profesionales (crear/editar, activar/
// desactivar, asignar servicios y sedes): OWNER o ADMIN, mismo criterio que
// reportes/inventario. No necesita chequeo de plan/módulo — gestionar
// profesionales es una función core de todos los planes, solo cambia el
// tope numérico de activos (ver hasReachedProfessionalLimit en
// src/lib/planLimits.ts). 404 en vez de 403.
export async function requireProfessionalsManageAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  const hasProfessionalsManageAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );
  if (!hasProfessionalsManageAccess) notFound();

  return { session, tenant };
}

// Guard de acceso para gestionar el catálogo de servicios (crear/editar):
// OWNER o ADMIN, mismo criterio que profesionales. Sin chequeo de plan/
// módulo — gestionar servicios es función core de todos los planes. 404 en
// vez de 403.
export async function requireServicesManageAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  const hasServicesManageAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );
  if (!hasServicesManageAccess) notFound();

  return { session, tenant };
}

// Guard de acceso para gestionar campos personalizados de la ficha de
// cliente (src/app/dashboard/[tenantSlug]/client-fields): OWNER o ADMIN,
// mismo criterio que servicios/profesionales. Sin gating de plan — esta
// función está disponible en los 4 planes por igual. 404 en vez de 403.
export async function requireClientFieldsManageAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  const hasClientFieldsManageAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );
  if (!hasClientFieldsManageAccess) notFound();

  return { session, tenant };
}

// Guard de acceso para gestionar el catálogo de inventario (crear/editar
// ítems): además del chequeo de plan de requireInventoryAccess, exige OWNER
// o ADMIN, mismo criterio que reportes. Ver un ítem, su stock por sede y
// registrar movimientos de entrada/salida NO usa este guard — para eso
// alcanza con requireInventoryAccess + hasLocationAccess sobre la sede
// puntual (cualquier STAFF con acceso a esa sede puede registrar un
// movimiento). 404 en vez de 403.
export async function requireInventoryManageAccess(tenantSlug: string) {
  const { session, tenant } = await requireInventoryAccess(tenantSlug);

  const hasInventoryManageAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );
  if (!hasInventoryManageAccess) notFound();

  return { session, tenant };
}

// Guard de acceso para gestionar el equipo (invitar usuarios, editar sus
// StaffLocationRole por sede): OWNER o ADMIN, mismo criterio que reportes/
// profesionales/inventario-gestión. 404 en vez de 403. Además devuelve
// `isOwner` porque las Server Actions de team/actions.ts necesitan distinguir
// si quien actúa es OWNER o "solo" ADMIN para aplicar la regla anti-
// escalación de privilegios (un ADMIN no puede asignar ni editar el rol
// OWNER de nadie).
export async function requireTeamManageAccess(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  const hasTeamAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );
  if (!hasTeamAccess) notFound();

  const isOwner = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER"]
  );

  return { session, tenant, isOwner };
}

// Guard de acceso a facturación (configurar/gestionar la suscripción del
// SaaS). A diferencia de todos los guards de arriba, NO pasa por
// requireDashboardAccess ni por su bloqueo de PAST_DUE/CANCELLED: un tenant
// con el pago fallido tiene que poder llegar a esta página para arreglar su
// propio pago, si lo bloqueáramos igual que al resto del dashboard quedaría
// en un callejón sin salida. Chequeo propio, independiente: sesión + tenant
// de la URL coincide con el de la sesión + rol OWNER en alguna sede. 404 en
// vez de 403, mismo patrón que el resto de guards.
export async function requireBillingAccess(tenantSlug: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: { locations: true },
  });
  if (!tenant) notFound();

  if (session.user.tenantId !== tenant.id) notFound();

  const hasOwnerAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER"]
  );
  if (!hasOwnerAccess) notFound();

  return { session, tenant };
}
