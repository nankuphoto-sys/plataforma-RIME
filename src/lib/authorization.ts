import type { Role } from "@prisma/client";

// Lógica de autorización por sede — pura, sin acceso a base de datos, para
// poder testearla sin mocks. Quien la llama es responsable de traer las
// StaffLocationRole del usuario desde la base de datos (nunca confiar en
// roles que vienen solo de la sesión del cliente para autorizar mutaciones).
export interface StaffLocationRoleRecord {
  locationId: string;
  role: Role;
}

// ¿Tiene el usuario algún rol asignado sobre esta location puntual?
// Es la verificación que debe hacer toda mutación sobre una cita/recurso
// que pertenece a una location específica.
export function hasLocationAccess(
  roles: StaffLocationRoleRecord[],
  locationId: string
): boolean {
  return roles.some((role) => role.locationId === locationId);
}

// ¿Tiene el usuario algún rol en alguna de las locations de un tenant?
// Usado para decidir acceso a la agenda interna cuando todavía no se sabe
// sobre qué location específica se va a operar.
export function hasAnyRoleInTenantLocations(
  roles: StaffLocationRoleRecord[],
  tenantLocationIds: string[]
): boolean {
  const tenantLocationIdSet = new Set(tenantLocationIds);
  return roles.some((role) => tenantLocationIdSet.has(role.locationId));
}

// ¿Tiene el usuario alguno de los roles permitidos en alguna location del
// tenant? Usado para restringir secciones (como reportes) a OWNER/ADMIN.
export function hasAnyOfRolesInTenantLocations(
  roles: StaffLocationRoleRecord[],
  tenantLocationIds: string[],
  allowedRoles: Role[]
): boolean {
  const tenantLocationIdSet = new Set(tenantLocationIds);
  return roles.some(
    (role) => tenantLocationIdSet.has(role.locationId) && allowedRoles.includes(role.role)
  );
}

// ¿Cuál es el rol del usuario en ESTA location puntual? Como
// StaffLocationRole tiene @@unique([userId, locationId]), un usuario tiene
// a lo sumo un rol por location — nunca hace falta desambiguar entre varios
// roles para la misma location. Usado por la agenda interna para decidir si
// mostrar "solo lo mío" (rol PROFESSIONAL) o la vista completa de la sede.
export function getRoleAtLocation(
  roles: StaffLocationRoleRecord[],
  locationId: string
): Role | undefined {
  return roles.find((role) => role.locationId === locationId)?.role;
}

// ¿Es este usuario "solo profesional" dentro del tenant? Es decir: tiene al
// menos un rol en alguna location del tenant, y TODOS esos roles son
// PROFESSIONAL — nunca OWNER/ADMIN/STAFF en ninguna sede del tenant. Se usa
// para restringir la ficha de clientes a "solo lo mío": un usuario que
// además es STAFF/ADMIN/OWNER en alguna sede sigue viendo el CRM completo,
// porque ese otro rol ya requiere esa visibilidad más amplia. A diferencia
// de getRoleAtLocation (que es por sede puntual, para la agenda), esto es a
// nivel de todo el tenant porque Client no tiene locationId propio.
export function isProfessionalOnlyInTenant(
  roles: StaffLocationRoleRecord[],
  tenantLocationIds: string[]
): boolean {
  const tenantLocationIdSet = new Set(tenantLocationIds);
  const rolesInTenant = roles.filter((role) => tenantLocationIdSet.has(role.locationId));
  if (rolesInTenant.length === 0) return false;
  return rolesInTenant.every((role) => role.role === "PROFESSIONAL");
}
