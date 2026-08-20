import { afterEach, describe, expect, it, vi } from "vitest";

const pushSubscriptionFindMany = vi.fn();
const sendPushNotification = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: (...args: unknown[]) => pushSubscriptionFindMany(...args),
    },
  },
}));

vi.mock("@/lib/webPush", () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotification(...args),
}));

import { notifyStaff } from "./staffNotifications";

describe("notifyStaff", () => {
  afterEach(() => {
    pushSubscriptionFindMany.mockReset();
    sendPushNotification.mockReset();
  });

  it("filtra por tenantId y por la preferencia pedida, vía la relación con User", async () => {
    pushSubscriptionFindMany.mockResolvedValueOnce([]);

    await notifyStaff("tenant-1", "notifyLowStock", { title: "t", body: "b" });

    expect(pushSubscriptionFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", user: { notifyLowStock: true } },
      select: { endpoint: true, p256dh: true, auth: true },
    });
  });

  it("manda el payload a cada suscripción encontrada", async () => {
    const subs = [
      { endpoint: "https://push.example.com/a", p256dh: "p1", auth: "a1" },
      { endpoint: "https://push.example.com/b", p256dh: "p2", auth: "a2" },
    ];
    pushSubscriptionFindMany.mockResolvedValueOnce(subs);
    sendPushNotification.mockResolvedValue(undefined);

    const payload = { title: "Nueva cita", body: "Mariana reservó una cita" };
    await notifyStaff("tenant-1", "notifyNewAppointment", payload);

    expect(sendPushNotification).toHaveBeenCalledTimes(2);
    expect(sendPushNotification).toHaveBeenCalledWith(subs[0], payload);
    expect(sendPushNotification).toHaveBeenCalledWith(subs[1], payload);
  });

  it("nunca lanza, incluso si la consulta a la base falla", async () => {
    pushSubscriptionFindMany.mockRejectedValueOnce(new Error("la base está caída"));

    await expect(
      notifyStaff("tenant-1", "notifyDailySummary", { title: "t", body: "b" })
    ).resolves.toBeUndefined();
  });

  it("no manda nada si no hay suscripciones que matcheen", async () => {
    pushSubscriptionFindMany.mockResolvedValueOnce([]);

    await notifyStaff("tenant-1", "notifyAppointmentReminder", { title: "t", body: "b" });

    expect(sendPushNotification).not.toHaveBeenCalled();
  });
});
