/**
 * The admin dashboard against the test database (BUILD_PLAN.md C28, ARCHITECTURE.md §4.7): a
 * hand-built fixture of orders in known states and dates, asserted exactly against the revenue,
 * pending-revenue, total-orders, average-order-value, wholesale-leads, most-selling and
 * previous-period figures; a day-boundary check for the chart; and the dashboard page's permission
 * gate. Fixture dates are offsets from "now" (not fixed calendar dates) so the suite never goes
 * stale, and a separate, date-independent sub-test covers the Karachi 23:30 boundary directly
 * through `repo.ts`. Mirrors `features/auth/rbac.integration.test.ts`'s `next/headers` mock, since
 * there is no Next server around a direct call. Skips without TEST_DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS } from "@/features/auth/permissions";
import { assertTestDatabase, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";
import { formatMoney } from "@/features/pricing/money";
import { DAY_MS, karachiDayIndex, karachiMidnightUtc } from "./ranges";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

/** A thrown `redirect()` error's digest looks like `NEXT_REDIRECT;replace;/panel/403;307;`. */
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

type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("admin dashboard (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let orders: typeof import("@/server/db/schema/orders").orders;
  let orderItems: typeof import("@/server/db/schema/orders").orderItems;
  let wholesaleInquiries: typeof import("@/server/db/schema/wholesale").wholesaleInquiries;
  let products: typeof import("@/server/db/schema/catalog").products;
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let getDashboardCards: typeof import("./service").getDashboardCards;
  let getMostSellingProductsView: typeof import("./service").getMostSellingProductsView;
  let getDashboardChart: typeof import("./service").getDashboardChart;
  let getDailyRevenueSeries: typeof import("./repo").getDailyRevenueSeries;
  let DashboardPage: (typeof import("@/app/panel/(protected)/page"))["default"];

  let ids: FixtureIds;
  let plateProductId: number;
  let vaseProductId: number;

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ orders, orderItems } = await import("@/server/db/schema/orders"));
    ({ wholesaleInquiries } = await import("@/server/db/schema/wholesale"));
    ({ products } = await import("@/server/db/schema/catalog"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ getDashboardCards, getMostSellingProductsView, getDashboardChart } = await import("./service"));
    ({ getDailyRevenueSeries } = await import("./repo"));
    DashboardPage = (await import("@/app/panel/(protected)/page")).default;
  });

  afterAll(async () => {
    await pool.end();
  });

  // The extra 5s buffer keeps "days ago" safely in the past relative to the service's own later
  // `new Date()` call: MySQL's DATETIME column rounds (not truncates) sub-second precision, so an
  // order created "right now" can round up into the future by up to ~1s once read back.
  const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS - 5_000);

  async function insertOrder(overrides: Partial<typeof orders.$inferInsert> & { createdAt: Date }) {
    const [result] = await db.insert(orders).values({
      orderNumber: `TST-${randomUUID().slice(0, 10)}`,
      checkoutToken: randomUUID(),
      customerName: "Fixture Customer",
      phone: "923001234567",
      addressLine: "House 1",
      city: "Karachi",
      country: "PK",
      paymentMethod: "cod",
      orderStatus: "delivered",
      paymentStatus: "cod_collected",
      subtotal: "1000.00",
      discountTotal: "0.00",
      couponDiscount: "0.00",
      total: "1000.00",
      displayCurrency: "PKR",
      exchangeRate: "1.0000",
      displayTotal: "1000.00",
      ...overrides,
    });
    return result.insertId;
  }

  async function insertItem(orderId: number, productId: number, variantId: number, quantity: number, unitPrice: string, lineTotal: string) {
    await db.insert(orderItems).values({
      orderId,
      productId,
      variantId,
      nameSnapshot: productId === plateProductId ? "Test Plate" : "Test Vase",
      variantLabelSnapshot: "Default",
      skuSnapshot: "TEST-SKU",
      unitPrice,
      discountAmount: "0.00",
      quantity,
      lineTotal,
    });
  }

  async function insertInquiry(createdAt: Date) {
    await db.insert(wholesaleInquiries).values({
      name: "Fixture Lead",
      businessType: "retail",
      phone: "923001234567",
      city: "Karachi",
      message: "Fixture",
      status: "new",
      createdAt,
    });
  }

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ids = await seedFixtures(db);
    plateProductId = (await db.select({ id: products.id }).from(products).where(eq(products.slug, "test-plate")))[0].id;
    vaseProductId = (await db.select({ id: products.id }).from(products).where(eq(products.slug, "test-vase")))[0].id;
  });

  describe("a hand-computed fixture", () => {
    beforeEach(async () => {
      // Within the current 30-day period: counted (A, B), pending (C), excluded (E cancelled, F rejected).
      // `subtotal` is set equal to `total` on every row below (no discount/coupon, no delivery charge
      // yet), so "goods total" and "total" are the same figure here — see the dedicated test further
      // down for a row where they deliberately differ (a delivery charge has been added to `total`).
      const orderA = await insertOrder({
        createdAt: daysAgo(0),
        paymentMethod: "cod",
        orderStatus: "delivered",
        paymentStatus: "cod_collected",
        subtotal: "1000.00",
        total: "1000.00",
      });
      await insertItem(orderA, plateProductId, ids.plate, 3, "500.00", "1500.00");

      const orderB = await insertOrder({
        createdAt: daysAgo(3),
        paymentMethod: "bank_transfer",
        orderStatus: "processing",
        paymentStatus: "verified",
        subtotal: "2000.00",
        total: "2000.00",
      });
      await insertItem(orderB, vaseProductId, ids.vaseWhite, 2, "1000.00", "2000.00");

      const orderC = await insertOrder({
        createdAt: daysAgo(10),
        paymentMethod: "cod",
        orderStatus: "awaiting_shipping_quote",
        paymentStatus: "cod_pending",
        subtotal: "1500.00",
        total: "1500.00",
      });
      await insertItem(orderC, plateProductId, ids.plate, 1, "500.00", "500.00");

      const orderE = await insertOrder({
        createdAt: daysAgo(2),
        orderStatus: "cancelled",
        paymentStatus: "cod_pending",
        subtotal: "999999.00",
        total: "999999.00",
      });
      await insertItem(orderE, plateProductId, ids.plate, 100, "500.00", "50000.00");

      const orderF = await insertOrder({
        createdAt: daysAgo(2),
        paymentMethod: "bank_transfer",
        orderStatus: "rejected",
        paymentStatus: "rejected",
        subtotal: "999999.00",
        total: "999999.00",
      });
      await insertItem(orderF, vaseProductId, ids.vaseWhite, 100, "1000.00", "100000.00");

      // In the 30-day period's *previous* 30-day window (roughly 29-59 days ago), outside current.
      const orderD = await insertOrder({
        createdAt: daysAgo(45),
        orderStatus: "delivered",
        paymentStatus: "cod_collected",
        subtotal: "5000.00",
        total: "5000.00",
      });
      await insertItem(orderD, plateProductId, ids.plate, 5, "500.00", "2500.00");

      // Outside even the previous window: only "All time" sees it.
      const orderH = await insertOrder({
        createdAt: daysAgo(70),
        paymentMethod: "bank_transfer",
        orderStatus: "delivered",
        paymentStatus: "verified",
        subtotal: "3000.00",
        total: "3000.00",
      });
      await insertItem(orderH, vaseProductId, ids.vaseWhite, 1, "3000.00", "3000.00");

      await insertInquiry(daysAgo(1));
      await insertInquiry(daysAgo(15));
      await insertInquiry(daysAgo(45));
      await insertInquiry(daysAgo(70));
    });

    it("30 days: revenue, pending revenue, total orders and average order value match exactly, cancelled/rejected excluded", async () => {
      const [revenue, orders_, aov] = await getDashboardCards("30d");
      expect(revenue.value).toBe(formatMoney(300_000)); // A (1000) + B (2000), cod_collected/verified only
      expect(revenue.sub).toBe(`Pending ${formatMoney(150_000)}`); // C (1500), cod_pending
      expect(orders_.value).toBe("3"); // A, B, C — not the cancelled/rejected E, F
      expect(aov.value).toBe(formatMoney(150_000)); // (1000+2000+1500)/3 = 1500
    });

    it("30 days: revenue counts only the goods price, never a delivery charge already added to `total`", async () => {
      // subtotal 1000, but a 300 delivery charge has been added to `total` (1300) — Revenue (and
      // Pending) must count only the 1000 goods portion, never the 1300 the customer actually paid.
      const orderWithDelivery = await insertOrder({
        createdAt: daysAgo(1),
        paymentMethod: "bank_transfer",
        orderStatus: "processing",
        paymentStatus: "verified",
        subtotal: "1000.00",
        shippingTotal: "300.00",
        shippingNote: "Local courier",
        total: "1300.00",
      });
      await insertItem(orderWithDelivery, plateProductId, ids.plate, 2, "500.00", "1000.00");

      const [revenue, , aov] = await getDashboardCards("30d");
      // A (1000) + B (2000) + this order's goods-only 1000 = 4000 — not 4300.
      expect(revenue.value).toBe(formatMoney(400_000));
      // Average order value still uses the full `total` (1000+2000+1500+1300)/4 = 1450 — includes delivery.
      expect(aov.value).toBe(formatMoney(145_000));
    });

    it("30 days: the previous 30-day period gives the comparison its change badge is based on", async () => {
      const [revenue, orders_, aov] = await getDashboardCards("30d");
      // Previous period revenue is D alone (5000, 45 days ago); current is 3000 -> -40%.
      expect(revenue.change).toEqual({ kind: "down", percent: -40 });
      // Previous period order count is 1 (D); current is 3 -> +200%.
      expect(orders_.change).toEqual({ kind: "up", percent: 200 });
      // Previous AOV is 5000; current is 1500 -> -70%.
      expect(aov.change).toEqual({ kind: "down", percent: -70 });
    });

    it("30 days: wholesale leads count only inquiries placed in the period, with the previous period's own count", async () => {
      const [, , , wholesale] = await getDashboardCards("30d");
      expect(wholesale.value).toBe("2"); // 1 and 15 days ago
      expect(wholesale.change).toEqual({ kind: "up", percent: 100 }); // previous: 1 (45 days ago) -> 2 is +100%
    });

    it("30 days: most selling products collapse variants into the product and exclude cancelled/rejected orders", async () => {
      const top = await getMostSellingProductsView("30d");
      expect(top).toEqual([
        { productId: plateProductId, name: "Test Plate", unitsSold: 4, revenue: formatMoney(200_000), image: null }, // A (3) + C (1)
        { productId: vaseProductId, name: "Test Vase", unitsSold: 2, revenue: formatMoney(200_000), image: null }, // B (2)
      ]);
    });

    it("30 days: the chart has one point per day, today's bucket zero despite two excluded orders existing that day", async () => {
      const chart = await getDashboardChart("30d");
      if (chart.kind !== "data") throw new Error("expected chart data");
      expect(chart.bucket).toBe("day");
      expect(chart.points).toHaveLength(30);
      // 2 days ago: only the cancelled (E) and rejected (F) orders — both excluded, so a true zero.
      const twoDaysAgoPoint = chart.points[chart.points.length - 1 - 2];
      expect(twoDaysAgoPoint.revenuePaisa).toBe(0);
      expect(twoDaysAgoPoint.orderCount).toBe(0);
      // Today: order A alone (1000.00 = 100,000 paisa, cod_collected).
      const todayPoint = chart.points[chart.points.length - 1];
      expect(todayPoint.revenuePaisa).toBe(100_000);
      expect(todayPoint.orderCount).toBe(1);
    });

    it("all time: resolves the chart's start from the earliest order, past the known mysql2 raw-aggregate pitfall", async () => {
      // getEarliestOrderCreatedAt reads a raw min() aggregate, which mysql2 returns as a plain
      // string rather than a Date (unlike a normal typed column select) — regression coverage for
      // the exact crash a live run hit (`instant.getTime is not a function`) before this was fixed.
      const chart = await getDashboardChart("all");
      expect(chart.kind).toBe("data");
      if (chart.kind !== "data") return;
      expect(chart.points.length).toBeGreaterThan(0);
      const totalRevenue = chart.points.reduce((sum, point) => sum + point.revenuePaisa, 0);
      const totalOrders = chart.points.reduce((sum, point) => sum + point.orderCount, 0);
      expect(totalRevenue).toBe(1_100_000); // same orders as the "all time" stat card below
      expect(totalOrders).toBe(5);
    });

    it("all time: has no previous-period comparison and includes every order", async () => {
      const [revenue, orders_, aov, wholesale] = await getDashboardCards("all");
      expect(revenue.value).toBe(formatMoney(1_100_000)); // A+B+D+H = 1000+2000+5000+3000
      expect(revenue.change).toEqual({ kind: "none", percent: null });
      expect(orders_.value).toBe("5"); // A, B, C, D, H
      expect(orders_.change).toEqual({ kind: "none", percent: null });
      expect(aov.value).toBe(formatMoney(250_000)); // (1000+2000+1500+5000+3000)/5 = 2500
      expect(wholesale.value).toBe("4");
      expect(wholesale.change).toEqual({ kind: "none", percent: null });
    });

    it("all time: most selling totals every order not cancelled or rejected", async () => {
      const top = await getMostSellingProductsView("all");
      expect(top).toEqual([
        { productId: plateProductId, name: "Test Plate", unitsSold: 9, revenue: formatMoney(450_000), image: null }, // A(3)+C(1)+D(5)
        { productId: vaseProductId, name: "Test Vase", unitsSold: 3, revenue: formatMoney(500_000), image: null }, // B(2)+H(1)
      ]);
    });
  });

  describe("day boundary", () => {
    it("an order placed at 23:30 Karachi lands in that Karachi day, not the next one", async () => {
      // 2026-06-10 23:30 Karachi = 2026-06-10 18:30 UTC (Karachi is UTC+5) — still the 10th locally.
      const placedAt = new Date("2026-06-10T18:30:00.000Z");
      const orderId = await insertOrder({ createdAt: placedAt, subtotal: "4000.00", total: "4000.00" });
      await insertItem(orderId, plateProductId, ids.plate, 1, "4000.00", "4000.00");

      const tenthStart = karachiMidnightUtc(karachiDayIndex(placedAt));
      const eleventhStart = karachiMidnightUtc(karachiDayIndex(placedAt) + 1);
      const rows = await getDailyRevenueSeries(tenthStart, eleventhStart);

      expect(rows).toHaveLength(1);
      expect(rows[0].karachiDate).toBe("2026-06-10");
      expect(rows[0].revenuePaisaStr).toBe("4000.00");
      expect(rows[0].orderCount).toBe(1);
    });
  });

  describe("permissions", () => {
    async function signInAs(permissionKeys: readonly string[]): Promise<void> {
      const { token } = await createStaffSession(db, hashToken, [...permissionKeys]);
      current.cookies.set("panel_session", token);
    }

    it("an Admin session loads the dashboard", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expect(DashboardPage({ searchParams: Promise.resolve({}) })).resolves.toBeDefined();
    });

    it("a Developer session is redirected to its own first-allowed page, never the dashboard", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => DashboardPage({ searchParams: Promise.resolve({}) }), "/panel/products");
    });

    it("a session with neither permission is redirected to the account fallback", async () => {
      await signInAs([]);
      await expectRedirectTo(() => DashboardPage({ searchParams: Promise.resolve({}) }), "/panel/account");
    });
  });
});
