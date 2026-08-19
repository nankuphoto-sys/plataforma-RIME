import { afterEach, describe, expect, it, vi } from "vitest";

const errorLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    errorLog: {
      create: (...args: unknown[]) => errorLogCreate(...args),
    },
  },
}));

import { logError, logWarning } from "./errorLog";

describe("logError", () => {
  afterEach(() => {
    errorLogCreate.mockReset();
  });

  it("guarda message/stack de un Error real con level 'error'", async () => {
    errorLogCreate.mockResolvedValueOnce({});

    await logError(new Error("algo se rompió"), { tenantId: "tenant-1" });

    expect(errorLogCreate).toHaveBeenCalledTimes(1);
    const { data } = errorLogCreate.mock.calls[0][0];
    expect(data.level).toBe("error");
    expect(data.message).toBe("algo se rompió");
    expect(typeof data.stack).toBe("string");
    expect(data.tenantId).toBe("tenant-1");
  });

  it("maneja valores lanzados que no son instancias de Error", async () => {
    errorLogCreate.mockResolvedValueOnce({});

    await logError("un string cualquiera lanzado como error");

    const { data } = errorLogCreate.mock.calls[0][0];
    expect(data.message).toBe("un string cualquiera lanzado como error");
    expect(data.stack).toBeNull();
    expect(data.tenantId).toBeNull();
  });

  it("nunca lanza, incluso si prisma.errorLog.create falla", async () => {
    errorLogCreate.mockRejectedValueOnce(new Error("la base está caída"));

    await expect(logError(new Error("original"))).resolves.toBeUndefined();
  });

  it("incluye el resto del context (sin tenantId) en el campo context", async () => {
    errorLogCreate.mockResolvedValueOnce({});

    await logError(new Error("fallo webhook"), { tenantId: "t1", eventType: "invoice.paid" });

    const { data } = errorLogCreate.mock.calls[0][0];
    expect(data.context).toEqual({ eventType: "invoice.paid" });
  });
});

describe("logWarning", () => {
  afterEach(() => {
    errorLogCreate.mockReset();
  });

  it("guarda el mensaje con level 'warn'", async () => {
    errorLogCreate.mockResolvedValueOnce({});

    await logWarning("algo raro pero no fatal");

    const { data } = errorLogCreate.mock.calls[0][0];
    expect(data.level).toBe("warn");
    expect(data.message).toBe("algo raro pero no fatal");
  });

  it("nunca lanza, incluso si prisma.errorLog.create falla", async () => {
    errorLogCreate.mockRejectedValueOnce(new Error("la base está caída"));

    await expect(logWarning("advertencia")).resolves.toBeUndefined();
  });
});
