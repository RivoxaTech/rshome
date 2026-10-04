/**
 * Order CSV export (S18, REQUIREMENTS AD-06) and the printable slip against the test database: a
 * real COD order is placed through the checkout service, then exported and opened through the
 * real Route Handler / page the panel uses. `next/headers` is replaced the way every other
 * integration suite does it; `after()` is stubbed inline (D35) since `createOrder` fires
 * notifications through it and there is no real Next request scope here.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { orders } from "@/server/db/schema/orders";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void Promise.resolve().then(fn) };
});
vi.mock("@/server/mail/transport", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

type Db = typeof import("@/server/db/client");
type ExportRoute = typeof import("@/app/api/panel/orders/export/route");
type SlipPage = typeof import("@/app/panel/orders/[orderNumber]/slip/page");

async function expectRedirectTo(run: () => Promise<unknown>, path: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    expect(digest, `expected a redirect, got ${String(error)}`).toContain(`;${path};`);
    return;
  }
  throw new Error(`expected a redirect to ${path}, but nothing was thrown`);
}

describe.skipIf(!TEST_DATABASE_URL)("order CSV export and printable slip (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let exportRoute: ExportRoute;
  let slipPage: SlipPage;
  let ids: FixtureIds;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ createOrder } = await import("@/features/checkout/service"));
    exportRoute = await import("@/app/api/panel/orders/export/route");
    slipPage = await import("@/app/panel/orders/[orderNumber]/slip/page");
  });

  afterAll(async () => {
    await pool.end();
  });

  let orderNumber: string;

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ids = await seedFixtures(db);
    const placed = await createOrder(checkoutInput(ids), { ip: "export-test-ip" });
    if (!placed.ok) throw new Error(placed.error);
    orderNumber = placed.orderNumber;
  });

  describe("CSV export", () => {
    it("an Admin session exports the placed order within the filters, with an audit row", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      const response = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/orders/export?method=cod`));
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain(orderNumber);
      expect(text).toContain("Test Customer");

      const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.action, "order.export"));
      expect(auditRows.length).toBe(1);
    });

    // S22 BUG-16: the range is [from, to) like every other range in the app; an order placed exactly
    // at the next Karachi midnight belongs to the next day's export, not this one's.
    it("excludes an order placed exactly at the midnight that ends the range", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      // 2 Jan 2000 00:00 Karachi = 1 Jan 2000 19:00 UTC.
      await db.update(orders).set({ createdAt: new Date("2000-01-01T19:00:00Z") }).where(eq(orders.orderNumber, orderNumber));
      const sameDay = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/orders/export?method=cod&from=2000-01-01&to=2000-01-01`));
      expect(await sameDay.text()).not.toContain(orderNumber);
      const nextDay = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/orders/export?method=cod&from=2000-01-02&to=2000-01-02`));
      expect(await nextDay.text()).toContain(orderNumber);
    });

    it("excludes the order when the date range doesn't cover it", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      const response = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/orders/export?method=cod&from=2000-01-01&to=2000-01-02`));
      const text = await response.text();
      expect(text).not.toContain(orderNumber);
    });

    it("neutralises a formula-looking customer name", async () => {
      await resetTables(db);
      ids = await seedFixtures(db);
      const placed = await createOrder(checkoutInput(ids, { name: '=HYPERLINK("http://evil")' }), { ip: "export-test-ip-2" });
      if (!placed.ok) throw new Error(placed.error);
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      const response = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/orders/export?method=cod`));
      const text = await response.text();
      expect(text).toContain("'=HYPERLINK");
    });

    it("refuses a Developer session (order keys are Admin-only)", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const response = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/orders/export`));
      expect(response.status).toBe(403);
    });
  });

  describe("printable slip", () => {
    it("renders for an Admin session without redirecting", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expect(slipPage.default({ params: Promise.resolve({ orderNumber }), searchParams: Promise.resolve({}) })).resolves.toBeDefined();
    });

    it("redirects a Developer session to 403 (order keys are Admin-only)", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => slipPage.default({ params: Promise.resolve({ orderNumber }), searchParams: Promise.resolve({}) }), "/panel/403");
    });

    it("redirects to login with no session", async () => {
      current.cookies.clear();
      await expectRedirectTo(() => slipPage.default({ params: Promise.resolve({ orderNumber }), searchParams: Promise.resolve({}) }), "/panel/login");
    });
  });
});
