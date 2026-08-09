import { describe, expect, it } from "vitest";
import {
  getRoleAtLocation,
  hasAnyOfRolesInTenantLocations,
  hasAnyRoleInTenantLocations,
  hasLocationAccess,
  isProfessionalOnlyInTenant,
  type StaffLocationRoleRecord,
} from "./authorization";

describe("hasLocationAccess", () => {
  it("retorna true si el usuario tiene un rol en esa location exacta", () => {
    const roles: StaffLocationRoleRecord[] = [{ locationId: "loc-1", role: "STAFF" }];
    expect(hasLocationAccess(roles, "loc-1")).toBe(true);
  });

  it("retorna false si el usuario solo tiene roles en otras locations", () => {
    const roles: StaffLocationRoleRecord[] = [
      { locationId: "loc-2", role: "OWNER" },
      { locationId: "loc-3", role: "ADMIN" },
    ];
    expect(hasLocationAccess(roles, "loc-1")).toBe(false);
  });

  it("retorna false cuando el usuario no tiene ningún rol", () => {
    expect(hasLocationAccess([], "loc-1")).toBe(false);
  });

  it("es indiferente al tipo de rol: cualquier rol sobre la location cuenta", () => {
    const roles: StaffLocationRoleRecord[] = [{ locationId: "loc-1", role: "PROFESSIONAL" }];
    expect(hasLocationAccess(roles, "loc-1")).toBe(true);
  });
});

describe("hasAnyRoleInTenantLocations", () => {
  it("retorna true si alguno de los roles del usuario cae en las locations del tenant", () => {
    const roles: StaffLocationRoleRecord[] = [{ locationId: "loc-2", role: "STAFF" }];
    expect(hasAnyRoleInTenantLocations(roles, ["loc-1", "loc-2"])).toBe(true);
  });

  it("retorna false si los roles del usuario son de locations de otro tenant", () => {
    const roles: StaffLocationRoleRecord[] = [{ locationId: "loc-de-otro-tenant", role: "OWNER" }];
    expect(hasAnyRoleInTenantLocations(roles, ["loc-1", "loc-2"])).toBe(false);
  });

  it("retorna false cuando el tenant no tiene locations o el usuario no tiene roles", () => {
    expect(hasAnyRoleInTenantLocations([], ["loc-1"])).toBe(false);
    expect(hasAnyRoleInTenantLocations([{ locationId: "loc-1", role: "OWNER" }], [])).toBe(false);
  });
});

describe("hasAnyOfRolesInTenantLocations", () => {
  it("retorna true si el usuario tiene uno de los roles permitidos en una location del tenant", () => {
    const roles: StaffLocationRoleRecord[] = [{ locationId: "loc-1", role: "ADMIN" }];
    expect(hasAnyOfRolesInTenantLocations(roles, ["loc-1"], ["OWNER", "ADMIN"])).toBe(true);
  });

  it("retorna false si el rol del usuario no está en la lista de roles permitidos", () => {
    const roles: StaffLocationRoleRecord[] = [{ locationId: "loc-1", role: "STAFF" }];
    expect(hasAnyOfRolesInTenantLocations(roles, ["loc-1"], ["OWNER", "ADMIN"])).toBe(false);
  });

  it("retorna false si el rol permitido del usuario cae en una location de otro tenant", () => {
    const roles: StaffLocationRoleRecord[] = [{ locationId: "loc-de-otro-tenant", role: "OWNER" }];
    expect(hasAnyOfRolesInTenantLocations(roles, ["loc-1", "loc-2"], ["OWNER", "ADMIN"])).toBe(false);
  });

  it("retorna false cuando el usuario no tiene ningún rol", () => {
    expect(hasAnyOfRolesInTenantLocations([], ["loc-1"], ["OWNER", "ADMIN"])).toBe(false);
  });
});

describe("getRoleAtLocation", () => {
  it("retorna el rol del usuario en esa location exacta", () => {
    const roles: StaffLocationRoleRecord[] = [
      { locationId: "loc-1", role: "PROFESSIONAL" },
      { locationId: "loc-2", role: "STAFF" },
    ];
    expect(getRoleAtLocation(roles, "loc-1")).toBe("PROFESSIONAL");
    expect(getRoleAtLocation(roles, "loc-2")).toBe("STAFF");
  });

  it("retorna undefined si el usuario no tiene ningún rol en esa location", () => {
    const roles: StaffLocationRoleRecord[] = [{ locationId: "loc-2", role: "STAFF" }];
    expect(getRoleAtLocation(roles, "loc-1")).toBeUndefined();
  });
});

describe("isProfessionalOnlyInTenant", () => {
  it("retorna true si todos los roles del usuario en el tenant son PROFESSIONAL", () => {
    const roles: StaffLocationRoleRecord[] = [
      { locationId: "loc-1", role: "PROFESSIONAL" },
      { locationId: "loc-2", role: "PROFESSIONAL" },
    ];
    expect(isProfessionalOnlyInTenant(roles, ["loc-1", "loc-2"])).toBe(true);
  });

  it("retorna false si el usuario tiene STAFF/ADMIN/OWNER en alguna sede del tenant", () => {
    const roles: StaffLocationRoleRecord[] = [
      { locationId: "loc-1", role: "PROFESSIONAL" },
      { locationId: "loc-2", role: "STAFF" },
    ];
    expect(isProfessionalOnlyInTenant(roles, ["loc-1", "loc-2"])).toBe(false);
  });

  it("ignora roles de locations de otro tenant al decidir", () => {
    const roles: StaffLocationRoleRecord[] = [
      { locationId: "loc-1", role: "PROFESSIONAL" },
      { locationId: "loc-de-otro-tenant", role: "OWNER" },
    ];
    expect(isProfessionalOnlyInTenant(roles, ["loc-1"])).toBe(true);
  });

  it("retorna false cuando el usuario no tiene ningún rol en el tenant", () => {
    expect(isProfessionalOnlyInTenant([], ["loc-1"])).toBe(false);
    expect(isProfessionalOnlyInTenant([{ locationId: "loc-de-otro-tenant", role: "PROFESSIONAL" }], ["loc-1"])).toBe(
      false
    );
  });
});
