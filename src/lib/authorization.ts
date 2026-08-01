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
