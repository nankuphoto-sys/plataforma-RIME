import { afterEach, describe, expect, it, vi } from "vitest";

const tenantFindUnique = vi.fn();
const txTenantCreate = vi.fn();
const txLocationCreate = vi.fn();
const txUserCreate = vi.fn();
const txStaffLocationRoleCreate = vi.fn();
const txServiceCreate = vi.fn();
const txProfessionalCreate = vi.fn();
const txProfessionalServiceCreate = vi.fn();
const txProfessionalLocationCreate = vi.fn();
const txAccountCreate = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import { slugify, generateUniqueSlug, provisionTenantForOAuthUser } from "./tenantProvisioning";

const tx = {
  tenant: { create: (...args: unknown[]) => txTenantCreate(...args) },
  location: { create: (...args: unknown[]) => txLocationCreate(...args) },
  user: { create: (...args: unknown[]) => txUserCreate(...args) },
  staffLocationRole: { create: (...args: unknown[]) => txStaffLocationRoleCreate(...args) },
  service: { create: (...args: unknown[]) => txServiceCreate(...args) },
  professional: { create: (...args: unknown[]) => txProfessionalCreate(...args) },
  professionalService: { create: (...args: unknown[]) => txProfessionalServiceCreate(...args) },
  professionalLocation: { create: (...args: unknown[]) => txProfessionalLocationCreate(...args) },
  account: { create: (...args: unknown[]) => txAccountCreate(...args) },
};

describe("slugify", () => {
  it("pasa a minúsculas, saca acentos y cambia espacios/símbolos por guiones", () => {
    expect(slugify("Consultorio Ñañez & Asociados")).toBe("consultorio-nanez-asociados");
  });

  it("recorta guiones al principio/final", () => {
    expect(slugify("  ¡Hola!  ")).toBe("hola");
  });
});

describe("generateUniqueSlug", () => {
  afterEach(() => {
    tenantFindUnique.mockReset();
  });

  it("devuelve el slug base si está libre", async () => {
    tenantFindUnique.mockResolvedValueOnce(null);
    expect(await generateUniqueSlug("Negocio de Ana")).toBe("negocio-de-ana");
  });

  it("agrega un sufijo numérico si el slug base ya existe", async () => {
    tenantFindUnique
      .mockResolvedValueOnce({ id: "t1" }) // "negocio-de-ana" ocupado
      .mockResolvedValueOnce(null); // "negocio-de-ana-2" libre
    expect(await generateUniqueSlug("Negocio de Ana")).toBe("negocio-de-ana-2");
  });
});

describe("provisionTenantForOAuthUser", () => {
  afterEach(() => {
    tenantFindUnique.mockReset();
    txTenantCreate.mockReset();
    txLocationCreate.mockReset();
    txUserCreate.mockReset();
    txStaffLocationRoleCreate.mockReset();
    txServiceCreate.mockReset();
    txProfessionalCreate.mockReset();
    txProfessionalServiceCreate.mockReset();
    txProfessionalLocationCreate.mockReset();
    txAccountCreate.mockReset();
    transactionMock.mockReset();
  });

  const account = {
    type: "oidc",
    provider: "google",
    providerAccountId: "google-sub-123",
    access_token: "at",
    refresh_token: null,
    expires_at: 1999999999,
    token_type: "Bearer",
    scope: "openid email profile",
    id_token: "idtok",
    session_state: null,
  };

  it("crea Tenant + Location + User (sin password) + StaffLocationRole OWNER + Service/Professional placeholder + Account", async () => {
    tenantFindUnique.mockResolvedValueOnce(null); // slug libre
    txTenantCreate.mockResolvedValueOnce({ id: "tenant-1" });
    txLocationCreate.mockResolvedValueOnce({ id: "loc-1" });
    txUserCreate.mockResolvedValueOnce({ id: "user-1" });
    txServiceCreate.mockResolvedValueOnce({ id: "service-1" });
    txProfessionalCreate.mockResolvedValueOnce({ id: "pro-1" });
    transactionMock.mockImplementationOnce(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx));

    await provisionTenantForOAuthUser({
      email: "ana@correo.com",
      name: "Ana Pérez",
      image: "https://foto.com/a.jpg",
      account,
    });

    expect(txTenantCreate).toHaveBeenCalledWith({
      data: {
        name: "Negocio de Ana Pérez",
        slug: "negocio-de-ana-perez",
        plan: "INDIVIDUAL",
        vertical: "GENERAL",
        status: "TRIAL",
      },
    });
    expect(txLocationCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", name: "Sede Principal", timezone: "America/Bogota" },
    });
    expect(txUserCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        name: "Ana Pérez",
        email: "ana@correo.com",
        passwordHash: null,
        image: "https://foto.com/a.jpg",
      },
    });
    expect(txStaffLocationRoleCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", locationId: "loc-1", role: "OWNER" },
    });
    expect(txServiceCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", name: "Consulta general", durationMinutes: 45, price: 50000 },
    });
    expect(txProfessionalCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", userId: "user-1", name: "Ana Pérez", active: true },
    });
    expect(txProfessionalServiceCreate).toHaveBeenCalledWith({
      data: { professionalId: "pro-1", serviceId: "service-1" },
    });
    expect(txProfessionalLocationCreate).toHaveBeenCalledWith({
      data: { professionalId: "pro-1", locationId: "loc-1" },
    });
    expect(txAccountCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        type: "oidc",
        provider: "google",
        providerAccountId: "google-sub-123",
        access_token: "at",
        refresh_token: null,
        expires_at: 1999999999,
        token_type: "Bearer",
        scope: "openid email profile",
        id_token: "idtok",
        session_state: null,
      },
    });
  });

  it("no lanza si la transacción falla por email duplicado (carrera de dos requests)", async () => {
    tenantFindUnique.mockResolvedValueOnce(null);
    const duplicateEmailError = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["email"] },
      name: "PrismaClientKnownRequestError",
    });
    Object.setPrototypeOf(duplicateEmailError, (await import("@prisma/client")).Prisma.PrismaClientKnownRequestError.prototype);
    transactionMock.mockRejectedValueOnce(duplicateEmailError);

    await expect(
      provisionTenantForOAuthUser({ email: "ana@correo.com", name: "Ana", image: null, account })
    ).resolves.toBeUndefined();
  });

  it("relanza cualquier otro error que no sea el de email duplicado", async () => {
    tenantFindUnique.mockResolvedValueOnce(null);
    transactionMock.mockRejectedValueOnce(new Error("la base está caída"));

    await expect(
      provisionTenantForOAuthUser({ email: "ana@correo.com", name: "Ana", image: null, account })
    ).rejects.toThrow("la base está caída");
  });
});
