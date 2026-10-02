/**
 * The panel's discounts CRUD against the test database (S12): the real Server Actions with the
 * literal field names the form posts, target checks, the storefront reflecting panel-created
 * rows on the next read (shop cards, the product page, the cart quote, a real `createOrder`),
 * deactivated/scheduled/expired/deleted discounts disappearing, "lowest price wins, never stack",
 * the overlap hint, audit rows with old/new values, and the Developer-vs-Admin RBAC wall. Mirrors
 * `categories.integration.test.ts`. Skips without TEST_DATABASE_URL.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { categories, products } from "@/server/db/schema/catalog";
import { orderItems, orders } from "@/server/db/schema/orders";
import { discountTargets, discounts } from "@/server/db/schema/promotions";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";
import { karachiLocalToUtc } from "@/lib/karachi-datetime";
import { END_IN_PAST_MESSAGE, START_IN_PAST_MESSAGE } from "./dates";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

type Db = typeof import("@/server/db/client");
type PanelActions = typeof import("@/app/panel/(protected)/discounts/actions");

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
/** A Karachi `datetime-local` value for an instant, the way the form posts it. */
let toLocal: (date: Date) => string;

describe.skipIf(!TEST_DATABASE_URL)("discounts CRUD (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let staffService: typeof import("./staff-service");
  let catalog: typeof import("@/features/catalog/service");
  let quoteCart: typeof import("@/features/cart/service").quoteCart;
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let panelActions: PanelActions;
  let DiscountsPageBody: typeof import("@/components/panel/discounts/DiscountsPageBody").DiscountsPageBody;

  let ids: FixtureIds;
  let categoryId: number;
  let plateProductId: number;
  let vaseProductId: number;
  let actorId: number;
  let ipCounter = 0;
  const nextIp = () => `discount-test-${++ipCounter}`;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  /** Exactly the fields `DiscountForm` posts. */
  const validInput = (overrides: Record<string, string | number> = {}) => ({
    name: "15% off Test Tableware",
    type: "percent",
    value: "15",
    targetType: "category",
    categoryId: String(categoryId),
    productIds: "",
    startsAt: "",
    endsAt: "",
    isActive: "true",
    ...overrides,
  });

  const auditRows = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "discount"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  /** `options` is only ever `{ allowPastDates: true }`, for fixtures that must already have started or ended. */
  async function create(overrides: Record<string, string | number> = {}, options?: { allowPastDates: true }): Promise<number> {
    const result = await staffService.createDiscount(validInput(overrides), { id: actorId }, options);
    if (!result.ok) throw new Error(`createDiscount refused: ${result.error}`);
    return result.id!;
  }

  async function plateCard() {
    const listing = await catalog.listProducts({ category: null, nameQuery: null, sort: "recommended", page: 1 });
    return listing.cards.find((card) => card.slug === "test-plate")!;
  }

  async function plateQuote(couponCode: string | null = null) {
    const result = await quoteCart({ lines: [{ variantId: ids.plate, quantity: 2 }], couponCode, phone: null }, { ip: nextIp() });
    if (!result.ok) throw new Error(result.error);
    return result.quote;
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    staffService = await import("./staff-service");
    catalog = await import("@/features/catalog/service");
    ({ quoteCart } = await import("@/features/cart/service"));
    ({ createOrder } = await import("@/features/checkout/service"));
    panelActions = await import("@/app/panel/(protected)/discounts/actions");
    ({ DiscountsPageBody } = await import("@/components/panel/discounts/DiscountsPageBody"));
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
    [{ id: categoryId }] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "test-tableware"));
    [{ id: plateProductId }] = await db.select({ id: products.id }).from(products).where(eq(products.slug, "test-plate"));
    [{ id: vaseProductId }] = await db.select({ id: products.id }).from(products).where(eq(products.slug, "test-vase"));
  });

  describe("create (through the real Server Action, literal field names)", () => {
    it("creates a category discount, its target row and an audit row, then redirects to the list", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => panelActions.createDiscountAction(null, form(validInput())), "/panel/discounts");

      const [row] = await db.select().from(discounts).where(eq(discounts.name, "15% off Test Tableware"));
      expect(row).toMatchObject({ type: "percent", value: "15.00", targetType: "category", isActive: true, startsAt: null, endsAt: null });
      expect(await db.select().from(discountTargets).where(eq(discountTargets.discountId, row.id))).toEqual([{ discountId: row.id, targetId: categoryId }]);

      const [audit] = await auditRows(row.id, "discount.create");
      expect(audit.oldValues).toBeNull();
      expect(JSON.parse(audit.newValues!)).toMatchObject({ name: "15% off Test Tableware", type: "percent", value: "15.00", targetType: "category", targetIds: [categoryId], isActive: true });
    });

    it("creates a fixed discount on two products from the picker's comma-separated ids", async () => {
      const id = await create({ name: "PKR 200 off two", type: "fixed", value: "200", targetType: "product", categoryId: "", productIds: `${plateProductId},${vaseProductId}` });
      const targets = await db.select().from(discountTargets).where(eq(discountTargets.discountId, id));
      expect(targets.map((target) => target.targetId).sort()).toEqual([plateProductId, vaseProductId].sort());
    });

    it("refuses every boundary violation as { ok: false } with a field error, writing nothing", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const cases: [Record<string, string>, string][] = [
        [{ value: "0" }, "value"],
        [{ value: "150" }, "value"],
        [{ type: "fixed", value: "0" }, "value"],
        [{ categoryId: "" }, "categoryId"],
        [{ targetType: "product", productIds: "" }, "productIds"],
        [{ startsAt: "2026-10-05T10:00", endsAt: "2026-10-05T10:00" }, "endsAt"],
        [{ startsAt: "not-a-date" }, "startsAt"],
        [{ name: "" }, "name"],
      ];
      for (const [overrides, field] of cases) {
        const result = await panelActions.createDiscountAction(null, form(validInput(overrides)));
        expect(result.ok, `expected ${JSON.stringify(overrides)} to be refused`).toBe(false);
        if (!result.ok) expect(result.fieldErrors?.[field], `expected a ${field} error for ${JSON.stringify(overrides)}`).toBeDefined();
      }
      expect(await db.select().from(discounts)).toHaveLength(0);
    });

    it("refuses a target id that doesn't exist, under the transaction", async () => {
      const missingCategory = await staffService.createDiscount(validInput({ categoryId: "999999" }), { id: actorId });
      expect(missingCategory).toMatchObject({ ok: false, fieldErrors: { categoryId: expect.any(String) } });

      const missingProduct = await staffService.createDiscount(validInput({ targetType: "product", categoryId: "", productIds: `${plateProductId},999999` }), { id: actorId });
      expect(missingProduct).toMatchObject({ ok: false, fieldErrors: { productIds: expect.stringMatching(/no longer exists/) } });
      expect(await db.select().from(discounts)).toHaveLength(0);
    });
  });

  describe("update, activate/deactivate and delete", () => {
    it("updateDiscountAction saves new fields and targets with an old/new audit row, plus a deactivate row when the switch flips", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const id = await create();

      await expectRedirectTo(
        () => panelActions.updateDiscountAction(null, form({ ...validInput({ name: "Renamed", value: "20", targetType: "product", categoryId: "", productIds: String(vaseProductId), isActive: "false" }), id })),
        "/panel/discounts",
      );

      const [row] = await db.select().from(discounts).where(eq(discounts.id, id));
      expect(row).toMatchObject({ name: "Renamed", value: "20.00", targetType: "product", isActive: false });
      expect(await db.select().from(discountTargets).where(eq(discountTargets.discountId, id))).toEqual([{ discountId: id, targetId: vaseProductId }]);

      const [update] = await auditRows(id, "discount.update");
      expect(JSON.parse(update.oldValues!)).toMatchObject({ name: "15% off Test Tableware", value: "15.00", targetType: "category", targetIds: [categoryId], isActive: true });
      expect(JSON.parse(update.newValues!)).toMatchObject({ name: "Renamed", value: "20.00", targetType: "product", targetIds: [vaseProductId], isActive: false });
      expect(await auditRows(id, "discount.deactivate")).toHaveLength(1);
    });

    it("setDiscountActiveAction toggles with its own audit rows and refuses a no-op", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const id = await create();

      expect(await panelActions.setDiscountActiveAction(null, form({ id, isActive: "false" }))).toEqual({ ok: true });
      expect((await db.select().from(discounts).where(eq(discounts.id, id)))[0].isActive).toBe(false);
      const [deactivate] = await auditRows(id, "discount.deactivate");
      expect([JSON.parse(deactivate.oldValues!), JSON.parse(deactivate.newValues!)]).toEqual([{ isActive: true }, { isActive: false }]);

      expect(await panelActions.setDiscountActiveAction(null, form({ id, isActive: "false" }))).toMatchObject({ ok: false, error: expect.stringMatching(/already inactive/) });

      expect(await panelActions.setDiscountActiveAction(null, form({ id, isActive: "true" }))).toEqual({ ok: true });
      expect(await auditRows(id, "discount.activate")).toHaveLength(1);
    });

    it("deleteDiscountAction removes the row and its targets, keeps an audit row with the old values, and redirects", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const id = await create();

      await expectRedirectTo(() => panelActions.deleteDiscountAction(null, form({ id })), "/panel/discounts");
      expect(await db.select().from(discounts).where(eq(discounts.id, id))).toHaveLength(0);
      expect(await db.select().from(discountTargets).where(eq(discountTargets.discountId, id))).toHaveLength(0);
      const [audit] = await auditRows(id, "discount.delete");
      expect(JSON.parse(audit.oldValues!)).toMatchObject({ name: "15% off Test Tableware", targetIds: [categoryId] });

      expect(await panelActions.deleteDiscountAction(null, form({ id }))).toMatchObject({ ok: false, error: "Discount not found." });
    });
  });

  describe("the storefront reflects panel-created discounts on the next read", () => {
    it("a category discount shows the struck-through price and badge on the shop card, the product page and the cart quote", async () => {
      expect((await plateCard()).price).toEqual({ amount: "PKR 1,000", original: null, badge: null });

      await create();

      expect((await plateCard()).price).toEqual({ amount: "PKR 850", original: "PKR 1,000", badge: "15% off" });
      const detail = await catalog.getProductDetail("test-plate");
      expect(detail?.variants[0].price).toEqual({ amount: "PKR 850", original: "PKR 1,000", badge: "15% off" });

      const quote = await plateQuote();
      expect(quote.lines[0].unitPrice).toEqual({ amount: "PKR 850", original: "PKR 1,000", badge: "15% off" });
      expect(quote).toMatchObject({ subtotal: "PKR 2,000", discountTotal: "PKR 300", total: "PKR 1,700", expectedTotal: "1700.00" });
    });

    it("a deactivated, scheduled or expired discount is not applied; re-activating brings it back", async () => {
      const id = await create();
      await staffService.setDiscountActive(id, false, { id: actorId });
      expect((await plateCard()).price.original).toBeNull();

      await staffService.setDiscountActive(id, true, { id: actorId });
      expect((await plateCard()).price.original).toBe("PKR 1,000");
      await staffService.deleteDiscountById(id, { id: actorId });

      await create({ name: "Tomorrow", startsAt: toLocal(new Date(Date.now() + 24 * hour)) });
      expect((await plateCard()).price.original).toBeNull();

      await create({ name: "Ended", startsAt: toLocal(new Date(Date.now() - 48 * hour)), endsAt: toLocal(new Date(Date.now() - 24 * hour)) }, { allowPastDates: true });
      expect((await plateCard()).price.original).toBeNull();
      expect((await catalog.getProductDetail("test-plate"))?.variants[0].price.original).toBeNull();
    });

    it("deleting the discount removes it from the storefront", async () => {
      const id = await create();
      expect((await plateCard()).price.original).toBe("PKR 1,000");
      await staffService.deleteDiscountById(id, { id: actorId });
      expect((await plateCard()).price.original).toBeNull();
    });

    it("a fixed discount on two products takes the amount off each product's own price", async () => {
      await create({ name: "PKR 200 off", type: "fixed", value: "200", targetType: "product", categoryId: "", productIds: `${plateProductId},${vaseProductId}` });
      const listing = await catalog.listProducts({ category: null, nameQuery: null, sort: "recommended", page: 1 });
      expect(listing.cards.find((card) => card.slug === "test-plate")?.price).toEqual({ amount: "PKR 800", original: "PKR 1,000", badge: "20% off" });
      expect(listing.cards.find((card) => card.slug === "test-vase")?.price).toEqual({ amount: "PKR 2,300", original: "PKR 2,500", badge: "8% off" });
    });

    it("overlapping discounts never stack: the single lowest final price wins, and the overlap hint names the other one", async () => {
      const categoryDiscount = await create({ name: "10% off category", value: "10" }); // 1000 -> 900
      await create({ name: "PKR 200 off plate", type: "fixed", value: "200", targetType: "product", categoryId: "", productIds: String(plateProductId) }); // 1000 -> 800

      expect((await plateCard()).price).toEqual({ amount: "PKR 800", original: "PKR 1,000", badge: "20% off" }); // not 700

      const hint = await staffService.findOverlappingDiscounts({ targetType: "product", categoryId: "", productIds: String(plateProductId), excludeId: "" });
      expect(hint).toMatchObject({ ok: true, matchedProducts: 1 });
      if (hint.ok) expect(hint.overlaps.map((other) => other.name).sort()).toEqual(["10% off category", "PKR 200 off plate"]);

      // Editing the category discount itself: only the *other* one is reported, and only while it's active.
      const editing = await staffService.findOverlappingDiscounts({ targetType: "category", categoryId: String(categoryId), productIds: "", excludeId: String(categoryDiscount) });
      if (editing.ok) expect(editing.overlaps.map((other) => other.name)).toEqual(["PKR 200 off plate"]);
    });

    it("a real createOrder prices the lines with the panel-created discount and snapshots it on the items", async () => {
      await create();
      const quote = await plateQuote();
      const result = await createOrder(checkoutInput(ids, { expectedTotal: quote.expectedTotal }), { ip: nextIp() });
      expect(result).toMatchObject({ ok: true, created: true });
      if (!result.ok) return;

      const [order] = await db.select().from(orders).where(eq(orders.orderNumber, result.orderNumber));
      expect(order).toMatchObject({ subtotal: "2000.00", discountTotal: "300.00", couponDiscount: "0.00", total: "1700.00" });
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      expect(items[0]).toMatchObject({ unitPrice: "1000.00", discountAmount: "150.00", quantity: 2, lineTotal: "1700.00" });

      // A stale expectedTotal (from before the discount existed) is refused, never silently repriced.
      const stale = await createOrder(checkoutInput(ids, { expectedTotal: "2000.00" }), { ip: nextIp() });
      expect(stale).toMatchObject({ ok: false, error: expect.stringMatching(/Prices changed/) });
    });
  });

  describe("no dates in the past (owner follow-up), through the real Server Actions", () => {
    const pastStart = () => toLocal(new Date(Date.now() - hour));
    const pastEnd = () => toLocal(new Date(Date.now() - hour));

    it("createDiscountAction refuses a past start with a field error and writes nothing", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const result = await panelActions.createDiscountAction(null, form(validInput({ startsAt: pastStart() })));
      expect(result).toEqual({ ok: false, error: START_IN_PAST_MESSAGE, fieldErrors: { startsAt: START_IN_PAST_MESSAGE } });
      expect(await db.select().from(discounts)).toHaveLength(0);
    });

    it("createDiscountAction refuses a past end", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const result = await panelActions.createDiscountAction(null, form(validInput({ endsAt: pastEnd() })));
      expect(result).toMatchObject({ ok: false, fieldErrors: { endsAt: END_IN_PAST_MESSAGE } });
      expect(await db.select().from(discounts)).toHaveLength(0);
    });

    it("a start typed as 'now' (minute-rounded, so up to 59s in the past) is accepted — the 5-minute tolerance", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => panelActions.createDiscountAction(null, form(validInput({ startsAt: toLocal(new Date()) }))), "/panel/discounts");
      expect(await db.select().from(discounts)).toHaveLength(1);
    });

    it("the Server Action never bypasses the rule: the same past-dated post the seed is allowed to make is refused here", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const input = validInput({ startsAt: toLocal(new Date(Date.now() - 48 * hour)), endsAt: pastEnd() });
      expect(await panelActions.createDiscountAction(null, form(input))).toMatchObject({ ok: false, fieldErrors: { startsAt: START_IN_PAST_MESSAGE, endsAt: END_IN_PAST_MESSAGE } });
      expect(await staffService.createDiscount(input, { id: actorId }, { allowPastDates: true })).toMatchObject({ ok: true });
    });

    it("editing a live discount (past start unchanged) saves a new name", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const startsAt = toLocal(new Date(Date.now() - 48 * hour));
      const id = await create({ name: "Live since Monday", startsAt }, { allowPastDates: true });

      await expectRedirectTo(() => panelActions.updateDiscountAction(null, form({ ...validInput({ name: "Live since Monday (renamed)", startsAt }), id })), "/panel/discounts");
      const [row] = await db.select().from(discounts).where(eq(discounts.id, id));
      expect(row.name).toBe("Live since Monday (renamed)");
      expect(row.startsAt?.getTime()).toBe(karachiLocalToUtc(startsAt)!.getTime()); // the past start itself is kept as posted
    });

    it("editing that moves the start into the past is refused, leaving the row untouched", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const id = await create({ name: "Future start", startsAt: toLocal(new Date(Date.now() + 24 * hour)) });
      const result = await panelActions.updateDiscountAction(null, form({ ...validInput({ name: "Moved back", startsAt: pastStart() }), id }));
      expect(result).toMatchObject({ ok: false, fieldErrors: { startsAt: START_IN_PAST_MESSAGE } });
      const [row] = await db.select().from(discounts).where(eq(discounts.id, id));
      expect(row.name).toBe("Future start");
    });

    it("editing that moves the end into the past is refused, while an unchanged past end is fine", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const endsAt = toLocal(new Date(Date.now() - hour));
      const expired = await create({ name: "Already over", endsAt }, { allowPastDates: true });
      await expectRedirectTo(() => panelActions.updateDiscountAction(null, form({ ...validInput({ name: "Already over (renamed)", endsAt }), id: expired })), "/panel/discounts");

      const live = await create({ name: "Open ended" });
      const result = await panelActions.updateDiscountAction(null, form({ ...validInput({ name: "Open ended", endsAt: pastEnd() }), id: live }));
      expect(result).toMatchObject({ ok: false, fieldErrors: { endsAt: END_IN_PAST_MESSAGE } });
    });
  });

  describe("pricing rules confirmed end to end with panel-created rows", () => {
    it("a fixed discount larger than the price gives PKR 0 at the lowest, never a negative price", async () => {
      await create({ name: "Too generous", type: "fixed", value: "5000", targetType: "product", categoryId: "", productIds: String(plateProductId) });
      expect((await plateCard()).price).toEqual({ amount: "PKR 0", original: "PKR 1,000", badge: "100% off" });
      const quote = await plateQuote();
      expect(quote).toMatchObject({ subtotal: "PKR 2,000", discountTotal: "PKR 2,000", total: "PKR 0", expectedTotal: "0.00" });
    });

    it("a discount on a parent category also covers products in its sub-categories", async () => {
      const [child] = await db.insert(categories).values({ name: "Test Vases", slug: "test-vases", parentId: categoryId });
      await db.update(products).set({ categoryId: child.insertId }).where(eq(products.id, vaseProductId));

      await create({ name: "Parent-wide 10%", value: "10", categoryId: String(categoryId) });
      const listing = await catalog.listProducts({ category: null, nameQuery: null, sort: "recommended", page: 1 });
      expect(listing.cards.find((card) => card.slug === "test-vase")?.price).toEqual({ amount: "PKR 2,250", original: "PKR 2,500", badge: "10% off" });
      expect(listing.cards.find((card) => card.slug === "test-plate")?.price.original).toBe("PKR 1,000");
    });
  });

  describe("the list", () => {
    it("computes the status tabs and counts from the shared rule, and searches by name", async () => {
      await create({ name: "Live" });
      await create({ name: "Soon", startsAt: toLocal(new Date(Date.now() + 24 * hour)) });
      await create({ name: "Gone", endsAt: toLocal(new Date(Date.now() - hour)) }, { allowPastDates: true });
      await create({ name: "Off", isActive: "false" });

      const all = await staffService.listStaffDiscounts({ tab: "all", page: 1, pageSize: 25 });
      expect(all.counts).toEqual({ all: 4, active: 1, scheduled: 1, expired: 1, inactive: 1 });
      expect(all.items.map((item) => [item.name, item.status, item.valueText, item.targetText])).toEqual(
        expect.arrayContaining([
          ["Live", "active", "15%", "Category: Test Tableware"],
          ["Soon", "scheduled", "15%", "Category: Test Tableware"],
          ["Gone", "expired", "15%", "Category: Test Tableware"],
          ["Off", "inactive", "15%", "Category: Test Tableware"],
        ]),
      );

      const scheduled = await staffService.listStaffDiscounts({ tab: "scheduled", page: 1, pageSize: 25 });
      expect(scheduled.items.map((item) => item.name)).toEqual(["Soon"]);

      const searched = await staffService.listStaffDiscounts({ tab: "all", q: "gon", page: 1, pageSize: 25 });
      expect(searched.items.map((item) => item.name)).toEqual(["Gone"]);
      expect(searched.counts.all).toBe(1);
    });
  });

  describe("RBAC", () => {
    it("a Developer session can open the list page and run every action", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expect(DiscountsPageBody({ searchParams: {} })).resolves.toBeDefined();
      await expectRedirectTo(() => panelActions.createDiscountAction(null, form(validInput())), "/panel/discounts");
      expect(await panelActions.discountOverlapAction({ targetType: "all", categoryId: "", productIds: "", excludeId: "" })).toMatchObject({ ok: true });
    });

    it("a session holding only discount.manage is allowed too", async () => {
      await signInAs([PERMISSIONS.DISCOUNT_MANAGE]);
      await expect(DiscountsPageBody({ searchParams: {} })).resolves.toBeDefined();
    });

    it("an Admin session is refused on the list page and every Server Action", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => DiscountsPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.createDiscountAction(null, form(validInput())), "/panel/403");
      await expectRedirectTo(() => panelActions.updateDiscountAction(null, form({ ...validInput(), id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.setDiscountActiveAction(null, form({ id: "1", isActive: "false" })), "/panel/403");
      await expectRedirectTo(() => panelActions.deleteDiscountAction(null, form({ id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.discountOverlapAction({ targetType: "all", categoryId: "", productIds: "", excludeId: "" }), "/panel/403");
      expect(await db.select().from(discounts)).toHaveLength(0);
    });

    it("a session with only product.* keys, or only coupon.manage, is refused", async () => {
      await signInAs([PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE, PERMISSIONS.PRODUCT_DELETE]);
      await expectRedirectTo(() => DiscountsPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.createDiscountAction(null, form(validInput())), "/panel/403");

      await signInAs([PERMISSIONS.COUPON_MANAGE]);
      await expectRedirectTo(() => DiscountsPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.deleteDiscountAction(null, form({ id: "1" })), "/panel/403");
    });

    it("no session at all is sent to the login page", async () => {
      await expectRedirectTo(() => DiscountsPageBody({ searchParams: {} }), "/panel/login");
    });
  });
});
