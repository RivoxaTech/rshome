import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.hoisted(() => vi.fn());
const setVapidDetails = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { sendNotification, setVapidDetails } }));
// Deterministic regardless of whether the developer's .env.local happens to carry VAPID keys.
vi.mock("@/server/env", () => ({
  env: { VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "test-private-key", VAPID_SUBJECT: "mailto:test@example.com" },
}));

const SUBSCRIPTION = { endpoint: "https://push.example.com/ep", p256dh: "p256dh-key", auth: "auth-key" };

describe("sendPush", () => {
  beforeEach(() => {
    sendNotification.mockReset();
    sendNotification.mockResolvedValue(undefined);
  });

  it("sends every push urgent and short-lived: TTL 1 day, urgency high", async () => {
    const { sendPush } = await import("./push");
    const result = await sendPush(SUBSCRIPTION, { title: "x", body: "y", url: "z", tag: "t" });

    expect(result).toEqual({ ok: true });
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: SUBSCRIPTION.p256dh, auth: SUBSCRIPTION.auth } },
      JSON.stringify({ title: "x", body: "y", url: "z", tag: "t" }),
      { TTL: 86400, urgency: "high" },
    );
  });
});
