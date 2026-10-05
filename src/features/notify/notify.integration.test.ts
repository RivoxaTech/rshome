/**
 * Push notifications against the test database (BUILD_PLAN.md S21): subscribe/unsubscribe and
 * their permission gate, that an event reaches exactly the right subscribers, that a stale (410)
 * subscription is swept, that a failing send never fails the order that triggered it, and the
 * live-count polling endpoint's own permission gate. `@/server/notify/push` (the actual web-push
 * wire call) is mocked throughout; `next/headers` is replaced the way every other panel
 * integration suite does, since there is no Next server around a direct call. Skips without
 * TEST_DATABASE_URL.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { pushSubscriptions } from "@/server/db/schema/notify";
import { orders } from "@/server/db/schema/orders";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
    set: (name: string, value: string) => current.cookies.set(name, value),
  }),
  headers: async () => new Headers(),
}));

const sendPush = vi.hoisted(() => vi.fn());
vi.mock("@/server/notify/push", () => ({ sendPush }));

type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("push notifications (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let notify: typeof import("./service");
  let subscribeRoute: typeof import("@/app/api/push/subscribe/route");
  let testRoute: typeof import("@/app/api/push/test/route");
  let pollRoute: typeof import("@/app/api/panel/notifications/route");

  let ids: FixtureIds;
  let endpointCounter = 0;
  const nextEndpoint = () => `https://push.example.com/endpoint-${randomBytes(4).toString("hex")}-${++endpointCounter}`;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<{ userId: number }> {
    const { userId, token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
    return { userId };
  }

  function jsonRequest(path: string, method: "POST" | "DELETE" | "GET", body?: unknown, origin: string | null = ORIGIN): Request {
    const headers = new Headers();
    if (body !== undefined) headers.set("content-type", "application/json");
    if (origin) headers.set("origin", origin);
    return new Request(`${ORIGIN}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  }

  const subscriptionsOf = (userId: number) => db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  const notifyFailures = () => db.select().from(auditLogs).where(eq(auditLogs.action, "notify.failed"));

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ createOrder } = await import("@/features/checkout/service"));
    notify = await import("./service");
    subscribeRoute = await import("@/app/api/push/subscribe/route");
    testRoute = await import("@/app/api/push/test/route");
    pollRoute = await import("@/app/api/panel/notifications/route");
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    sendPush.mockReset();
    sendPush.mockResolvedValue({ ok: true });
    await resetTables(db);
    ids = await seedFixtures(db);
  });

  it("subscribes and unsubscribes a device, and a repeat subscribe updates rather than duplicates", async () => {
    const { userId } = await signInAs([PERMISSIONS.ORDER_VIEW]);
    const endpoint = nextEndpoint();
    const body = { endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } };

    const first = await subscribeRoute.POST(jsonRequest("/api/push/subscribe", "POST", body));
    expect(first.status).toBe(201);
    expect(await subscriptionsOf(userId)).toHaveLength(1);

    // Same browser subscribing again (e.g. a refreshed key) updates the row, never duplicates it.
    const second = await subscribeRoute.POST(jsonRequest("/api/push/subscribe", "POST", { ...body, keys: { p256dh: "new-key", auth: "auth-key" } }));
    expect(second.status).toBe(201);
    const rows = await subscriptionsOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("new-key");

    const removed = await subscribeRoute.DELETE(jsonRequest("/api/push/subscribe", "DELETE", { endpoint }));
    expect(removed.status).toBe(200);
    expect(await subscriptionsOf(userId)).toHaveLength(0);
  });

  // S22 SEC-04: the endpoint is where the server will POST every order event.
  it("refuses an endpoint that is not an https host name (http, localhost, an IP literal)", async () => {
    const { userId } = await signInAs([PERMISSIONS.ORDER_VIEW]);
    const keys = { p256dh: "p256dh-key", auth: "auth-key" };
    for (const endpoint of ["http://push.example.com/x", "https://localhost/x", "https://127.0.0.1:3306/x", "https://[::1]/x", "ftp://push.example.com/x"]) {
      const response = await subscribeRoute.POST(jsonRequest("/api/push/subscribe", "POST", { endpoint, keys }));
      expect(response.status, endpoint).toBe(400);
    }
    expect(await subscriptionsOf(userId)).toHaveLength(0);
  });

  it("keeps at most 10 subscriptions per user, dropping the oldest", async () => {
    const { userId } = await signInAs([PERMISSIONS.ORDER_VIEW]);
    const keys = { p256dh: "p256dh-key", auth: "auth-key" };
    const first = nextEndpoint();
    const response = await subscribeRoute.POST(jsonRequest("/api/push/subscribe", "POST", { endpoint: first, keys }));
    expect(response.status).toBe(201);
    // Older than everything that follows, whatever the clock resolution.
    await db.update(pushSubscriptions).set({ createdAt: new Date(Date.now() - 60_000) }).where(eq(pushSubscriptions.userId, userId));
    for (let i = 0; i < 10; i += 1) {
      expect((await subscribeRoute.POST(jsonRequest("/api/push/subscribe", "POST", { endpoint: nextEndpoint(), keys }))).status).toBe(201);
    }
    const rows = await subscriptionsOf(userId);
    expect(rows).toHaveLength(10);
    expect(rows.some((row) => row.endpoint === first)).toBe(false);
  });

  it("refuses to subscribe a session holding neither order.view nor wholesale.view", async () => {
    await signInAs([PERMISSIONS.PRODUCT_VIEW]);
    const response = await subscribeRoute.POST(
      jsonRequest("/api/push/subscribe", "POST", { endpoint: nextEndpoint(), keys: { p256dh: "p", auth: "a" } }),
    );
    expect(response.status).toBe(403);
  });

  it("subscribes a wholesale.view-only session too (the bell shows for either permission) and stays idempotent on a repeat", async () => {
    const { userId } = await signInAs([PERMISSIONS.WHOLESALE_VIEW]);
    const body = { endpoint: nextEndpoint(), keys: { p256dh: "p-wholesale", auth: "a-wholesale" } };

    const first = await subscribeRoute.POST(jsonRequest("/api/push/subscribe", "POST", body));
    expect(first.status).toBe(201);
    // The self-healing re-subscribe (NotificationBell.tsx) resends the same subscription on every
    // panel load; the upsert must make that a no-op, never a duplicate row.
    const second = await subscribeRoute.POST(jsonRequest("/api/push/subscribe", "POST", body));
    expect(second.status).toBe(201);
    expect(await subscriptionsOf(userId)).toHaveLength(1);
  });

  it("sends a new_order push to every order.view subscriber and to nobody else", async () => {
    const admin1 = await signInAs([PERMISSIONS.ORDER_VIEW]);
    await notify.subscribe(admin1.userId, { endpoint: nextEndpoint(), keys: { p256dh: "p1", auth: "a1" } }, null);
    const admin2 = await signInAs([PERMISSIONS.ORDER_VIEW]);
    await notify.subscribe(admin2.userId, { endpoint: nextEndpoint(), keys: { p256dh: "p2", auth: "a2" } }, null);
    const developer = await signInAs([PERMISSIONS.PRODUCT_VIEW]);
    await notify.subscribe(developer.userId, { endpoint: nextEndpoint(), keys: { p256dh: "p3", auth: "a3" } }, null);

    await notify.notifyNewOrder("RSH-TEST-0001", "cod");

    expect(sendPush).toHaveBeenCalledTimes(2);
    const sentTo = sendPush.mock.calls.map(([subscription]) => subscription.p256dh);
    expect(sentTo.sort()).toEqual(["p1", "p2"]);
  });

  it("deletes a subscription whose send comes back 410", async () => {
    const { userId } = await signInAs([PERMISSIONS.ORDER_VIEW]);
    await notify.subscribe(userId, { endpoint: nextEndpoint(), keys: { p256dh: "stale", auth: "a" } }, null);
    sendPush.mockResolvedValueOnce({ ok: false, statusCode: 410, message: "Gone" });

    await notify.notifyNewOrder("RSH-TEST-0002", "bank_transfer");

    expect(await subscriptionsOf(userId)).toHaveLength(0);
  });

  it("never fails the triggering action when a channel fails, and logs it instead", async () => {
    const { userId } = await signInAs([PERMISSIONS.ORDER_VIEW]);
    await notify.subscribe(userId, { endpoint: nextEndpoint(), keys: { p256dh: "p", auth: "a" } }, null);
    sendPush.mockRejectedValueOnce(new Error("network down"));

    const placed = await createOrder(checkoutInput(ids), { ip: "notify-ip-1" });
    if (!placed.ok) throw new Error(placed.error);

    await expect(notify.notifyNewOrder(placed.orderNumber, placed.paymentMethod)).resolves.toBeUndefined();

    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, placed.orderNumber));
    expect(order).toBeDefined();

    const failures = await notifyFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].entityId).toBe(placed.orderNumber);
    const newValues = JSON.parse(failures[0].newValues!);
    expect(newValues).toEqual({ channel: "push", reason: "network down" });
  });

  it("a Developer session cannot send itself a test notification path either (order.view required)", async () => {
    await signInAs([PERMISSIONS.PRODUCT_VIEW]);
    const response = await testRoute.POST(jsonRequest("/api/push/test", "POST"));
    expect(response.status).toBe(403);
  });

  it("the live-count polling endpoint is 401 signed out, 403 for a session without order.view, 200 with correct counts for one with it", async () => {
    const signedOut = await pollRoute.GET();
    expect(signedOut.status).toBe(401);

    await signInAs([PERMISSIONS.PRODUCT_VIEW]);
    const forbidden = await pollRoute.GET();
    expect(forbidden.status).toBe(403);

    await signInAs([PERMISSIONS.ORDER_VIEW]);
    const before = (await (await pollRoute.GET()).json()) as Record<string, number>;

    const placed = await createOrder(checkoutInput(ids), { ip: "notify-ip-2" });
    if (!placed.ok) throw new Error(placed.error);

    const after = (await (await pollRoute.GET()).json()) as Record<string, number>;
    expect(after["orders-cod"]).toBe((before["orders-cod"] ?? 0) + 1);
    // The raw Need review count (S22 follow-up: what the panel's poll-based sound fallback
    // compares) moves the same way needsAction does for a brand-new COD order.
    expect(after["orders-cod-new"]).toBe((before["orders-cod-new"] ?? 0) + 1);
  });
});
