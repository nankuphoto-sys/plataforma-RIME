import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyN8n } from "./n8n";

describe("notifyN8n", () => {
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = originalUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("no hace ningún fetch si N8N_WEBHOOK_URL no está configurada", async () => {
    delete process.env.N8N_WEBHOOK_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await notifyN8n({ event: "payment_failed", data: { tenantId: "t1" } });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hace POST a la URL configurada con event/data/timestamp", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/rime";
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    await notifyN8n({
      event: "payment_failed",
      data: { provider: "stripe", tenantId: "t1", amount: 59, currency: "cop" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://n8n.example.com/webhook/rime");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(options.body);
    expect(body.event).toBe("payment_failed");
    expect(body.data).toEqual({ provider: "stripe", tenantId: "t1", amount: 59, currency: "cop" });
    expect(typeof body.timestamp).toBe("string");
  });

  it("nunca lanza, incluso si el fetch a n8n falla", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/rime";
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("n8n caído")) as unknown as typeof fetch;

    await expect(notifyN8n({ event: "payment_failed", data: {} })).resolves.toBeUndefined();
  });

  it("nunca lanza si el fetch tarda más del timeout (abort)", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/rime";
    global.fetch = vi.fn().mockImplementation(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        })
    ) as unknown as typeof fetch;

    vi.useFakeTimers();
    const promise = notifyN8n({ event: "payment_failed", data: {} });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
