/**
 * The panel's coupons CRUD against the test database (S13): the real Server Actions with the
 * literal field names the form posts, code normalisation and case-insensitive uniqueness, the
 * usage counter driven by real `createOrder` calls, the usage-limit floor, delete refused once
 * used (Deactivate instead), the exclusivity rule with panel-created discounts and coupons, the
 * usage card's permission-gated order numbers, audit rows, and the Developer-vs-Admin RBAC wall.
 * Mirrors `discounts.integration.test.ts`. Skips without TEST_DATABASE_URL.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { products } from "@/server/db/schema/catalog";
import { orders } from "@/server/db/schema/orders";
import { couponUsages, coupons, discounts } from "@/server/db/schema/promotions";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";
import { END_IN_PAST_MESSAGE, START_IN_PAST_MESSAGE } from "@/features/discounts/dates";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

type Db = typeof import("@/server/db/client");
type PanelActions = typeof import("@/app/panel/(protected)/coupons/actions");

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

const hour = 60 * 60 * 1000;
let toLocal: (date: Date) => string;

describe.skipIf(!TEST_DATABASE_URL)("coupons CRUD (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let staffService: typeof import("./staff-service");
  let discountService: typeof import("@/features/discounts/staff-service");
  let quoteCart: typeof import("@/features/cart/service").quoteCart;
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let panelActions: PanelActions;
  let CouponsPageBody: typeof import("@/components/panel/coupons/CouponsPageBody").CouponsPageBody;

  let ids: FixtureIds;
  let vaseProductId: number;
  let actorId: number;
  let ipCounter = 0;
  const nextIp = () => `coupon-test-${++ipCounter}`;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  /** Exactly the fields `CouponForm` posts. */
  const validInput = (overrides: Record<string, string | number> = {}) => ({
    code: "save10",
    type: "percent",
    value: "10",
    minOrder: "",
    maxDiscount: "",
    usageLimit: "",
    perCustomerLimit: "",
    startsAt: "",
    endsAt: "",
    isActive: "true",
    ...overrides,
  });

  const auditRows = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "coupon"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  /** `options` is only ever `{ allowPastDates: true }`, for fixtures that must already have started or ended. */
  async function create(overrides: Record<string, string | number> = {}, options?: { allowPastDates: true }): Promise<number> {
    const result = await staffService.createCoupon(validInput(overrides), { id: actorId }, options);
    if (!result.ok) throw new Error(`createCoupon refused: ${result.error}`);
    return result.id!;
  }

  async function quote(lines: { variantId: number; quantity: number }[], couponCode: string | null, phone: string | null = null) {
    const result = await quoteCart({ lines, couponCode, phone }, { ip: nextIp() });
    if (!result.ok) throw new Error(result.error);
    return result.quote;
  }

  /** Two plates (PKR 2,000) with the coupon, through the quote then a real COD order, as the browser does it. */
  async function placeOrderWithCoupon(code: string, phone: string) {
    const q = await quote([{ variantId: ids.plate, quantity: 2 }], code, phone);
    expect(q.coupon.status, `expected ${code} to apply: ${JSON.stringify(q.coupon)}`).toBe("applied");
    const result = await createOrder(checkoutInput(ids, { phone, couponCode: q.storedCouponCode, expectedTotal: q.expectedTotal }), { ip: nextIp() });
    if (!result.ok) throw new Error(`createOrder refused: ${result.error}`);
    return result.orderNumber;
  }

  const usageCount = async (couponId: number) => (await db.select().from(couponUsages).where(eq(couponUsages.couponId, couponId))).length;

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    staffService = await import("./staff-service");
    discountService = await import("@/features/discounts/staff-service");
    ({ quoteCart } = await import("@/features/cart/service"));
    ({ createOrder } = await import("@/features/checkout/service"));
    panelActions = await import("@/app/panel/(protected)/coupons/actions");
    ({ CouponsPageBody } = await import("@/components/panel/coupons/CouponsPageBody"));
    ({ utcToKarachiLocal: toLocal } = await import("@/lib/karachi-datetime"));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ids = await seedFixtures(db);
    ({ userId: actorId } = await createStaffSession(db, hashToken, DEVELOPER_DEFAULT_PERMISSIONS));
    [{ id: vaseProductId }] = await db.select({ id: products.id }).from(products).where(eq(products.slug, "test-vase"));
  });

  describe("create (through the real Server Action, literal field names)", () => {
    it("normalises the code, stores the amounts and limits, writes an audit row, and redirects", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expectRedirectTo(
        () => panelActions.createCouponAction(null, form(validInput({ code: "  summer-25 ", value: "25", minOrder: "2000", maxDiscount: "500", usageLimit: "50", perCustomerLimit: "1" }))),
        "/panel/coupons",
      );

      const [row] = await db.select().from(coupons).where(eq(coupons.code, "SUMMER-25"));
      expect(row).toMatchObject({ type: "percent", value: "25.00", minOrder: "2000.00", maxDiscount: "500.00", usageLimit: 50, perCustomerLimit: 1, usedCount: 0, isActive: true });
      const [audit] = await auditRows(row.id, "coupon.create");
      expect(audit.oldValues).toBeNull();
      expect(JSON.parse(audit.newValues!)).toMatchObject({ code: "SUMMER-25", value: "25.00", maxDiscount: "500.00", usageLimit: 50 });
    });

    it("refuses a duplicate code case-insensitively with a field error (service check, and the unique index as backstop)", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await create({ code: "SAVE10" });
      const result = await panelActions.createCouponAction(null, form(validInput({ code: "save10" })));
      expect(result).toMatchObject({ ok: false, fieldErrors: { code: expect.stringMatching(/already in use/) } });
      expect(await db.select().from(coupons)).toHaveLength(2); // the fixture's TESTCOUPON + SAVE10
    });

    it("refuses every boundary violation as { ok: false } with a field error, writing nothing", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const cases: [Record<string, string>, string][] = [
        [{ code: "AB" }, "code"],
        [{ code: "SAVE 10" }, "code"],
        [{ value: "150" }, "value"],
        [{ type: "fixed", value: "0" }, "value"],
        [{ type: "fixed", value: "200", maxDiscount: "500" }, "maxDiscount"],
        [{ usageLimit: "0" }, "usageLimit"],
        [{ minOrder: "0" }, "minOrder"],
        [{ startsAt: "2026-10-05T10:00", endsAt: "2026-10-04T10:00" }, "endsAt"],
      ];
      for (const [overrides, field] of cases) {
        const result = await panelActions.createCouponAction(null, form(validInput(overrides)));
        expect(result.ok, `expected ${JSON.stringify(overrides)} to be refused`).toBe(false);
        if (!result.ok) expect(result.fieldErrors?.[field], `expected a ${field} error for ${JSON.stringify(overrides)}`).toBeDefined();
      }
      expect(await db.select().from(coupons)).toHaveLength(1); // only the fixture's
    });
  });

  describe("checkout and the usage counter", () => {
    it("a panel-created coupon applies at checkout and each placed order increments the live usage count", async () => {
      const id = await create({ code: "SAVE10", usageLimit: "5" });

      const before = await staffService.listStaffCoupons({ tab: "all", page: 1, pageSize: 25 });
      expect(before.items.find((item) => item.code === "SAVE10")).toMatchObject({ usageText: "0 / 5", status: "active", valueText: "10%" });

      const orderNumber = await placeOrderWithCoupon("save10", "0300 1234567");
      const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
      expect(order).toMatchObject({ couponId: id, couponCode: "SAVE10", couponDiscount: "200.00", total: "1800.00" });
      expect(await usageCount(id)).toBe(1);

      const after = await staffService.listStaffCoupons({ tab: "all", page: 1, pageSize: 25 });
      expect(after.items.find((item) => item.code === "SAVE10")?.usageText).toBe("1 / 5");

      const edit = await staffService.getCouponForEdit(id, { canViewOrders: false });
      expect(edit?.usage).toMatchObject({ count: 1, lastUsedAt: expect.any(String) });
      expect(edit?.usage.recent[0].order).toBeNull(); // the Developer never sees order numbers (C24)

      const asAdminViewer = await staffService.getCouponForEdit(id, { canViewOrders: true });
      expect(asAdminViewer?.usage.recent[0].order).toEqual({ orderNumber, paymentMethod: "cod" });
    });

    it("a coupon reaches 'Used up' when the live count meets its limit, and the checkout refuses it", async () => {
      await create({ code: "ONCE", usageLimit: "1" });
      await placeOrderWithCoupon("ONCE", "0300 1111111");

      const list = await staffService.listStaffCoupons({ tab: "used_up", page: 1, pageSize: 25 });
      expect(list.items.map((item) => item.code)).toEqual(["ONCE"]);
      expect(list.counts.used_up).toBe(1);

      const q = await quote([{ variantId: ids.plate, quantity: 2 }], "ONCE", "0300 2222222");
      expect(q.coupon).toMatchObject({ status: "rejected", reason: "COUPON_USAGE_LIMIT" });
    });

    it("lowering the usage limit below the live usage count is refused with a field error", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const id = await create({ code: "SAVE10", usageLimit: "10" });
      await placeOrderWithCoupon("SAVE10", "0300 1111111");
      await placeOrderWithCoupon("SAVE10", "0300 2222222");

      const result = await panelActions.updateCouponAction(null, form({ ...validInput({ code: "SAVE10", usageLimit: "1" }), id }));
      expect(result).toMatchObject({ ok: false, fieldErrors: { usageLimit: expect.stringMatching(/used 2 times/) } });
      expect((await db.select().from(coupons).where(eq(coupons.id, id)))[0].usageLimit).toBe(10);

      // Exactly the current count is fine, and so is clearing the limit.
      await expectRedirectTo(() => panelActions.updateCouponAction(null, form({ ...validInput({ code: "SAVE10", usageLimit: "2" }), id })), "/panel/coupons");
      await expectRedirectTo(() => panelActions.updateCouponAction(null, form({ ...validInput({ code: "SAVE10", usageLimit: "" }), id })), "/panel/coupons");
    });

    it("changing the type or value of a used coupon is allowed and leaves the placed order's snapshot alone", async () => {
      const id = await create({ code: "SAVE10" });
      const orderNumber = await placeOrderWithCoupon("SAVE10", "0300 1111111");

      const result = await staffService.updateCouponById(id, validInput({ code: "SAVE10", type: "fixed", value: "300" }), { id: actorId });
      expect(result).toMatchObject({ ok: true });

      const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
      expect(order).toMatchObject({ couponDiscount: "200.00", total: "1800.00" });
      const [update] = await auditRows(id, "coupon.update");
      expect(JSON.parse(update.oldValues!)).toMatchObject({ type: "percent", value: "10.00" });
      expect(JSON.parse(update.newValues!)).toMatchObject({ type: "fixed", value: "300.00" });
    });
  });

  describe("delete and deactivate", () => {
    it("a used coupon can never be deleted — only deactivated — and the guard says so up front", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const id = await create({ code: "SAVE10" });
      await placeOrderWithCoupon("SAVE10", "0300 1111111");

      expect(await staffService.checkCouponDeletable(id)).toEqual({ allowed: false, usageCount: 1, orderCount: 1 });
      expect(await panelActions.deleteCouponAction(null, form({ id }))).toMatchObject({ ok: false, error: expect.stringMatching(/Deactivate it instead/) });
      expect(await db.select().from(coupons).where(eq(coupons.id, id))).toHaveLength(1);

      expect(await panelActions.setCouponActiveAction(null, form({ id, isActive: "false" }))).toEqual({ ok: true });
      expect((await db.select().from(coupons).where(eq(coupons.id, id)))[0].isActive).toBe(false);
      const [deactivate] = await auditRows(id, "coupon.deactivate");
      expect([JSON.parse(deactivate.oldValues!), JSON.parse(deactivate.newValues!)]).toEqual([{ isActive: true }, { isActive: false }]);

      // Still referenced by the order after a release would clear the usage row (orders.coupon_id is a foreign key).
      await db.delete(couponUsages).where(eq(couponUsages.couponId, id));
      expect(await staffService.checkCouponDeletable(id)).toEqual({ allowed: false, usageCount: 0, orderCount: 1 });
      expect(await staffService.deleteCouponById(id, { id: actorId })).toMatchObject({ ok: false });
    });

    it("an unused coupon is deleted with an audit row carrying its old values, and the action redirects", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const id = await create({ code: "UNUSED" });
      expect(await staffService.checkCouponDeletable(id)).toEqual({ allowed: true });

      await expectRedirectTo(() => panelActions.deleteCouponAction(null, form({ id })), "/panel/coupons");
      expect(await db.select().from(coupons).where(eq(coupons.id, id))).toHaveLength(0);
      const [audit] = await auditRows(id, "coupon.delete");
      expect(JSON.parse(audit.oldValues!)).toMatchObject({ code: "UNUSED", value: "10.00" });
    });

    it("re-activating writes coupon.activate and a no-op toggle is refused", async () => {
      const id = await create({ code: "SAVE10", isActive: "false" });
      expect(await staffService.setCouponActive(id, false, { id: actorId })).toMatchObject({ ok: false, error: expect.stringMatching(/already inactive/) });
      expect(await staffService.setCouponActive(id, true, { id: actorId })).toEqual({ ok: true });
      expect(await auditRows(id, "coupon.activate")).toHaveLength(1);
    });
  });

  describe("exclusivity with panel-created discounts (REQUIREMENTS §7.3)", () => {
    beforeEach(async () => {
      const discount = await discountService.createDiscount(
        { name: "10% off vases", type: "percent", value: "10", targetType: "product", categoryId: "", productIds: String(vaseProductId), startsAt: "", endsAt: "", isActive: "true" },
        { id: actorId },
      );
      if (!discount.ok) throw new Error(discount.error);
      await create({ code: "SAVE10" });
    });

    it("the coupon is refused while the cart holds a discounted item", async () => {
      const q = await quote([{ variantId: ids.vaseWhite, quantity: 1 }], "SAVE10");
      expect(q.lines[0].unitPrice).toEqual({ amount: "PKR 2,250", original: "PKR 2,500", badge: "10% off" });
      expect(q.coupon).toMatchObject({ status: "rejected", reason: "COUPON_BLOCKED_BY_DISCOUNT", message: "Coupons cannot be combined with discounted items." });
      expect(q.storedCouponCode).toBeNull();
    });

    it("an applied coupon is removed, with the notice, when a discounted item is added", async () => {
      const before = await quote([{ variantId: ids.plate, quantity: 2 }], "SAVE10");
      expect(before.coupon).toMatchObject({ status: "applied", code: "SAVE10", discount: "PKR 200" });
      expect(before.storedCouponCode).toBe("SAVE10");

      const after = await quote(
        [
          { variantId: ids.plate, quantity: 2 },
          { variantId: ids.vaseWhite, quantity: 1 },
        ],
        before.storedCouponCode,
      );
      expect(after.coupon).toMatchObject({ status: "rejected", reason: "COUPON_BLOCKED_BY_DISCOUNT" });
      expect(after.notices).toContainEqual({ kind: "coupon", message: "Coupon SAVE10 was removed: Coupons cannot be combined with discounted items." });
      expect(after.storedCouponCode).toBeNull();
      expect(after).toMatchObject({ discountTotal: "PKR 250", total: "PKR 4,250" });
    });

    it("createOrder refuses the coupon under lock when a discounted line is in the order", async () => {
      const result = await createOrder(
        checkoutInput(ids, {
          lines: [
            { variantId: ids.plate, quantity: 2 },
            { variantId: ids.vaseWhite, quantity: 1 },
          ],
          couponCode: "SAVE10",
          expectedTotal: "4250.00",
        }),
        { ip: nextIp() },
      );
      expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be combined with discounted items/) });
      expect(await db.select().from(orders)).toHaveLength(0);
    });

    it("deactivating the discount in the panel lets the coupon apply to the same cart again", async () => {
      const [{ id: discountId }] = await db.select({ id: discounts.id }).from(discounts);
      await discountService.setDiscountActive(discountId, false, { id: actorId });
      const q = await quote([{ variantId: ids.vaseWhite, quantity: 1 }], "SAVE10");
      expect(q.coupon).toMatchObject({ status: "applied", code: "SAVE10", discount: "PKR 250" });
    });
  });

  describe("no dates in the past (owner follow-up), through the real Server Actions", () => {
    const past = () => toLocal(new Date(Date.now() - hour));

    it("createCouponAction refuses a past start with a field error and writes nothing", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      expect(await panelActions.createCouponAction(null, form(validInput({ startsAt: past() })))).toEqual({ ok: false, error: START_IN_PAST_MESSAGE, fieldErrors: { startsAt: START_IN_PAST_MESSAGE } });
      expect(await db.select().from(coupons)).toHaveLength(1); // only the fixture's
    });

    it("createCouponAction refuses a past end; the seed-only option is the one way past dates get in", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const input = validInput({ endsAt: past() });
      expect(await panelActions.createCouponAction(null, form(input))).toMatchObject({ ok: false, fieldErrors: { endsAt: END_IN_PAST_MESSAGE } });
      expect(await db.select().from(coupons)).toHaveLength(1);
      expect(await staffService.createCoupon(input, { id: actorId }, { allowPastDates: true })).toMatchObject({ ok: true });
    });

    it("editing a running coupon (past start unchanged) saves other fields", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const startsAt = toLocal(new Date(Date.now() - 48 * hour));
      const id = await create({ code: "RUNNING", startsAt }, { allowPastDates: true });
      await expectRedirectTo(() => panelActions.updateCouponAction(null, form({ ...validInput({ code: "RUNNING", startsAt, usageLimit: "9" }), id })), "/panel/coupons");
      expect((await db.select().from(coupons).where(eq(coupons.id, id)))[0].usageLimit).toBe(9);
    });

    it("editing that moves the start or the end into the past is refused", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const id = await create({ code: "FUTURE", startsAt: toLocal(new Date(Date.now() + 24 * hour)) });
      expect(await panelActions.updateCouponAction(null, form({ ...validInput({ code: "FUTURE", startsAt: past() }), id }))).toMatchObject({ ok: false, fieldErrors: { startsAt: START_IN_PAST_MESSAGE } });
      // With the start cleared, only the past end is wrong (with a future start kept, the schema's "after the start" check speaks first).
      expect(await panelActions.updateCouponAction(null, form({ ...validInput({ code: "FUTURE", startsAt: "", endsAt: past() }), id }))).toMatchObject({
        ok: false,
        fieldErrors: { endsAt: END_IN_PAST_MESSAGE },
      });
      const [row] = await db.select().from(coupons).where(eq(coupons.id, id));
      expect(row.endsAt).toBeNull();
    });
  });

  describe("pricing rules confirmed end to end with panel-created rows", () => {
    it("a percent coupon never takes off more than its cap", async () => {
      await create({ code: "CAPPED", value: "10", maxDiscount: "100" });
      const q = await quote([{ variantId: ids.plate, quantity: 2 }], "CAPPED"); // 10% of 2,000 would be 200
      expect(q.coupon).toMatchObject({ status: "applied", discount: "PKR 100" });
      expect(q).toMatchObject({ total: "PKR 1,900", expectedTotal: "1900.00" });
    });

    it("a per-customer limit of 1 refuses the same normalised phone on the second order, in the quote and under lock", async () => {
      await create({ code: "ONEEACH", perCustomerLimit: "1" });
      await placeOrderWithCoupon("ONEEACH", "0300 5555555");

      const q = await quote([{ variantId: ids.plate, quantity: 2 }], "ONEEACH", "+92 300 5555555");
      expect(q.coupon).toMatchObject({ status: "rejected", reason: "COUPON_PER_CUSTOMER_LIMIT" });
      const refused = await createOrder(checkoutInput(ids, { phone: "+92 300 5555555", couponCode: "ONEEACH", expectedTotal: "1800.00" }), { ip: nextIp() });
      expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/already used this coupon/) });

      const other = await quote([{ variantId: ids.plate, quantity: 2 }], "ONEEACH", "0300 6666666");
      expect(other.coupon).toMatchObject({ status: "applied" });
    });
  });

  describe("the list", () => {
    it("computes the status tabs and counts from the pricing rule, and searches by code", async () => {
      await create({ code: "LIVE" });
      await create({ code: "SOON", startsAt: toLocal(new Date(Date.now() + 24 * hour)) });
      await create({ code: "GONE", endsAt: toLocal(new Date(Date.now() - hour)) }, { allowPastDates: true });
      await create({ code: "OFF", isActive: "false" });
      await create({ code: "CAPPED", type: "fixed", value: "250", minOrder: "1500" });

      const all = await staffService.listStaffCoupons({ tab: "all", page: 1, pageSize: 25 });
      // The fixture's TESTCOUPON is active too.
      expect(all.counts).toEqual({ all: 6, active: 3, scheduled: 1, expired: 1, used_up: 0, inactive: 1 });
      expect(all.items.find((item) => item.code === "CAPPED")).toMatchObject({ valueText: "PKR 250 off", minOrderText: "PKR 1,500", usageText: "0" });

      const searched = await staffService.listStaffCoupons({ tab: "all", q: "go", page: 1, pageSize: 25 });
      expect(searched.items.map((item) => item.code)).toEqual(["GONE"]);
    });
  });

  describe("RBAC", () => {
    it("a Developer session can open the list page and run every action", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expect(CouponsPageBody({ searchParams: {} })).resolves.toBeDefined();
      await expectRedirectTo(() => panelActions.createCouponAction(null, form(validInput())), "/panel/coupons");
    });

    it("a session holding only coupon.manage is allowed too", async () => {
      await signInAs([PERMISSIONS.COUPON_MANAGE]);
      await expect(CouponsPageBody({ searchParams: {} })).resolves.toBeDefined();
    });

    it("an Admin session is refused on the list page and every Server Action", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => CouponsPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.createCouponAction(null, form(validInput())), "/panel/403");
      await expectRedirectTo(() => panelActions.updateCouponAction(null, form({ ...validInput(), id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.setCouponActiveAction(null, form({ id: "1", isActive: "false" })), "/panel/403");
      await expectRedirectTo(() => panelActions.deleteCouponAction(null, form({ id: "1" })), "/panel/403");
      expect(await db.select().from(coupons)).toHaveLength(1);
    });

    it("a session with only product.* keys, or only discount.manage, is refused", async () => {
      await signInAs([PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE, PERMISSIONS.PRODUCT_DELETE]);
      await expectRedirectTo(() => CouponsPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.createCouponAction(null, form(validInput())), "/panel/403");

      await signInAs([PERMISSIONS.DISCOUNT_MANAGE]);
      await expectRedirectTo(() => CouponsPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.deleteCouponAction(null, form({ id: "1" })), "/panel/403");
    });
  });
});
