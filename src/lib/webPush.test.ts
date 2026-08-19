import { WebPushError } from "web-push";
import { describe, expect, it } from "vitest";
import { isExpiredSubscriptionError } from "./webPush";

describe("isExpiredSubscriptionError", () => {
  it("devuelve true para un WebPushError con status 410 (Gone)", () => {
    const error = new WebPushError("Gone", 410, {}, "", "https://push.example.com/x");
    expect(isExpiredSubscriptionError(error)).toBe(true);
  });

  it("devuelve true para un WebPushError con status 404 (Not Found)", () => {
    const error = new WebPushError("Not Found", 404, {}, "", "https://push.example.com/x");
    expect(isExpiredSubscriptionError(error)).toBe(true);
  });

  it("devuelve false para un WebPushError con otro status (ej. 400/401/500)", () => {
    const badRequest = new WebPushError("Bad Request", 400, {}, "", "https://push.example.com/x");
    const unauthorized = new WebPushError("Unauthorized", 401, {}, "", "https://push.example.com/x");
    const serverError = new WebPushError("Server Error", 500, {}, "", "https://push.example.com/x");
    expect(isExpiredSubscriptionError(badRequest)).toBe(false);
    expect(isExpiredSubscriptionError(unauthorized)).toBe(false);
    expect(isExpiredSubscriptionError(serverError)).toBe(false);
  });

  it("devuelve false para un error que no es WebPushError", () => {
    expect(isExpiredSubscriptionError(new Error("algo genérico"))).toBe(false);
    expect(isExpiredSubscriptionError("no ni siquiera un Error")).toBe(false);
    expect(isExpiredSubscriptionError(null)).toBe(false);
  });
});
