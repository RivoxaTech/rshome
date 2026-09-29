/**
 * createOrder against the test database (ARCHITECTURE.md §8). vitest.setup.ts points the app's
 * db client at TEST_DATABASE_URL; without that variable this suite skips. The fixtures are
 * rebuilt at the start of the run, so the tests never depend on the seed.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rateLimits } from "@/server/db/schema/access-control";
import { categories, productImages, productVariants, products } from "@/server/db/schema/catalog";
import { orderItems, orderStatusHistory, orders, paymentProofs } from "@/server/db/schema/orders";
import { couponUsages, coupons } from "@/server/db/schema/promotions";
import { shippingZoneAreas, shippingZones } from "@/server/db/schema/shipping";
import { COD_PAKISTAN_ONLY_MESSAGE, PRICES_CHANGED_MESSAGE } from "./service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

type Db = typeof import("@/server/db/client");
type Checkout = typeof import("./service");
type Cart = typeof import("@/features/cart/service");
type Orders = typeof import("@/features/orders/service");

describe.skipIf(!TEST_DATABASE_URL)("createOrder (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let createOrder: Checkout["createOrder"];
  let quoteCart: Cart["quoteCart"];
  let trackOrder: Orders["trackOrder"];
  let getCustomerOrder: Orders["getCustomerOrder"];

  const ids = { plate: 0, vaseWhite: 0, vaseBlack: 0, karachiZone: 0, internationalZone: 0, coupon: 0 };
  let ipCounter = 0;
  const nextIp = () => `test-ip-${++ipCounter}`;

  const stockOf = async (variantId: number) =>
    (await db.select({ stock: productVariants.stock }).from(productVariants).where(eq(productVariants.id, variantId)))[0].stock;
  const orderCount = async () => (await db.select({ id: orders.id }).from(orders)).length;
  const orderByNumber = async (orderNumber: string) => (await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)))[0];

  function input(overrides: Record<string, unknown> = {}) {
    return {
      checkoutToken: randomUUID(),
      name: "Test Customer",
      phone: "0300 1234567",
      email: "",
      country: "PK",
      city: "Karachi",
      addressLine: "House 1, Street 2, DHA Phase 6",
      postalCode: "",
      note: "",
      paymentMethod: "cod",
      lines: [{ variantId: ids.plate, quantity: 2 }],
      couponCode: null,
      expectedTotal: "2000.00",
      ...overrides,
    };
  }

  async function resetTables() {
    // Children before parents, so no foreign-key toggling is needed.
    for (const table of [
      orderStatusHistory,
      paymentProofs,
      couponUsages,
      orderItems,
      orders,
      coupons,
      productImages,
      productVariants,
      products,
      categories,
      shippingZoneAreas,
      shippingZones,
      rateLimits,
    ]) {
      await db.delete(table);
    }
  }

  async function seedFixtures() {
    const [category] = await db.insert(categories).values({ name: "Test Tableware", slug: "test-tableware" });
    const [plate] = await db
      .insert(products)
      .values({ categoryId: category.insertId, name: "Test Plate", slug: "test-plate", price: "1000.00", status: "active" });
    const [vase] = await db
      .insert(products)
      .values({ categoryId: category.insertId, name: "Test Vase", slug: "test-vase", price: "2500.00", status: "active" });

    const variant = (values: typeof productVariants.$inferInsert) => db.insert(productVariants).values(values);
    // Plenty of plates: most tests below take two each and share this one fixture.
    ids.plate = (await variant({ productId: plate.insertId, sku: "TEST-PLATE", label: "Default", attributes: "{}", stock: 100 }))[0].insertId;
    ids.vaseWhite = (
      await variant({ productId: vase.insertId, sku: "TEST-VASE-WHT", label: "White", attributes: '{"Colour":"White"}', stock: 1 })
    )[0].insertId;
    ids.vaseBlack = (
      await variant({ productId: vase.insertId, sku: "TEST-VASE-BLK", label: "Black", attributes: '{"Colour":"Black"}', stock: 5, isActive: false })
    )[0].insertId;

    const zone = (values: typeof shippingZones.$inferInsert) => db.insert(shippingZones).values(values);
    ids.karachiZone = (await zone({ name: "Karachi", mode: "quote", flatRate: "0.00", codEnabled: true }))[0].insertId;
    const pakistanZone = (await zone({ name: "Pakistan", mode: "quote", flatRate: "0.00", codEnabled: true }))[0].insertId;
    ids.internationalZone = (await zone({ name: "International", mode: "quote", flatRate: "0.00", codEnabled: false, isFallback: true }))[0].insertId;
    await db.insert(shippingZoneAreas).values([
      { zoneId: ids.karachiZone, countryCode: "PK", city: "karachi" },
      { zoneId: pakistanZone, countryCode: "PK", city: null },
    ]);

    ids.coupon = (
      await db.insert(coupons).values({ code: "TESTCOUPON", type: "percent", value: "10.00", perCustomerLimit: 1, isActive: true })
    )[0].insertId;
  }

  beforeAll(async () => {
    // Imported here, not at the top, so the file loads even where no database env exists.
    const [client, checkout, cart, ordersService] = await Promise.all([
      import("@/server/db/client"),
      import("./service"),
      import("@/features/cart/service"),
      import("@/features/orders/service"),
    ]);
    db = client.db;
    pool = client.pool;
    createOrder = checkout.createOrder;
    quoteCart = cart.quoteCart;
    trackOrder = ordersService.trackOrder;
    getCustomerOrder = ordersService.getCustomerOrder;

    // Belt and braces: whatever the env says, only a *_test database gets wiped.
    const databaseName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
    if (!databaseName.endsWith("_test")) throw new Error(`Refusing to run integration tests against "${databaseName}".`);

    await resetTables();
    await seedFixtures();
  });

  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("places a COD order in Karachi: quote pending, stock down, snapshots and history written", async () => {
    const stockBefore = await stockOf(ids.plate);
    const result = await createOrder(input(), { ip: nextIp() });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.orderNumber).toMatch(/^RSH-\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);

    const order = await orderByNumber(result.orderNumber);
    expect(order).toMatchObject({
      orderStatus: "awaiting_shipping_quote",
      paymentStatus: "cod_pending",
      paymentMethod: "cod",
      shippingTotal: null,
      shippingZoneId: ids.karachiZone,
      phone: "923001234567",
      email: null,
      country: "PK",
      city: "Karachi",
      subtotal: "2000.00",
      discountTotal: "0.00",
      couponDiscount: "0.00",
      total: "2000.00",
      displayCurrency: "PKR",
      exchangeRate: "1.0000",
      displayTotal: "2000.00",
    });

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productId: expect.any(Number),
      variantId: ids.plate,
      nameSnapshot: "Test Plate",
      variantLabelSnapshot: "",
      skuSnapshot: "TEST-PLATE",
      unitPrice: "1000.00",
      discountAmount: "0.00",
      quantity: 2,
      lineTotal: "2000.00",
    });
    expect(await stockOf(ids.plate)).toBe(stockBefore - 2);

    const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
    expect(history.map((row) => [row.kind, row.fromStatus, row.toStatus])).toEqual([
      ["order", null, "awaiting_shipping_quote"],
      ["payment", null, "cod_pending"],
    ]);
  });

  it("places a bank-transfer order abroad in the fallback zone with the phone normalised", async () => {
    const result = await createOrder(
      input({ country: "GB", city: "London", phone: "+44 7911 123456", email: "jo@example.com", paymentMethod: "bank_transfer" }),
      { ip: nextIp() },
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(await orderByNumber(result.orderNumber)).toMatchObject({
      orderStatus: "awaiting_shipping_quote",
      paymentStatus: "unpaid",
      paymentMethod: "bank_transfer",
      shippingZoneId: ids.internationalZone,
      phone: "447911123456",
      email: "jo@example.com",
      country: "GB",
    });
  });

  it("refuses COD outside Pakistan even when the request claims a Pakistani city", async () => {
    const [ordersBefore, stockBefore] = [await orderCount(), await stockOf(ids.plate)];
    const result = await createOrder(input({ country: "AE", city: "Karachi", paymentMethod: "cod" }), { ip: nextIp() });
    expect(result).toEqual({ ok: false, error: COD_PAKISTAN_ONLY_MESSAGE });
    expect(await orderCount()).toBe(ordersBefore);
    expect(await stockOf(ids.plate)).toBe(stockBefore);
  });

  it("returns the same order for a repeated checkout token", async () => {
    const stockBefore = await stockOf(ids.plate);
    const checkoutToken = randomUUID();
    const first = await createOrder(input({ checkoutToken }), { ip: nextIp() });
    const second = await createOrder(input({ checkoutToken }), { ip: nextIp() });
    expect(first.ok && second.ok && first.orderNumber === second.orderNumber).toBe(true);

    const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.checkoutToken, checkoutToken));
    expect(rows).toHaveLength(1);
    expect(await stockOf(ids.plate)).toBe(stockBefore - 2);
  });

  it("gives one success and one sold-out refusal for the last unit ordered concurrently", async () => {
    expect(await stockOf(ids.vaseWhite)).toBe(1);
    const lines = [{ variantId: ids.vaseWhite, quantity: 1 }];
    const [a, b] = await Promise.all([
      createOrder(input({ lines, expectedTotal: "2500.00" }), { ip: nextIp() }),
      createOrder(input({ lines, expectedTotal: "2500.00" }), { ip: nextIp() }),
    ]);

    const results = [a, b];
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.find((result) => !result.ok);
    expect(refused).toMatchObject({ ok: false, error: "Test Vase (White) is sold out. Please remove it from your cart." });
    expect(await stockOf(ids.vaseWhite)).toBe(0);
  });

  it("refuses an order whose total no longer matches the quote", async () => {
    const ordersBefore = await orderCount();
    const result = await createOrder(input({ expectedTotal: "1999.00" }), { ip: nextIp() });
    expect(result).toEqual({ ok: false, error: PRICES_CHANGED_MESSAGE });
    expect(await orderCount()).toBe(ordersBefore);
  });

  it("refuses an inactive variant with a clear message", async () => {
    const result = await createOrder(input({ lines: [{ variantId: ids.vaseBlack, quantity: 1 }], expectedTotal: "2500.00" }), {
      ip: nextIp(),
    });
    expect(result).toEqual({ ok: false, error: "Test Vase (Black) is no longer available. Please remove it from your cart." });
  });

  it("enforces the coupon's per-customer limit by normalised phone, in the quote and under lock", async () => {
    const phone = "0300 9999999";
    const cart = { lines: [{ variantId: ids.plate, quantity: 2 }], couponCode: "testcoupon", phone };

    const firstQuote = await quoteCart(cart, { ip: nextIp() });
    expect(firstQuote.ok && firstQuote.quote.coupon).toMatchObject({ status: "applied", code: "TESTCOUPON", discount: "PKR 200" });
    if (!firstQuote.ok) return;

    const first = await createOrder(
      input({ phone, couponCode: firstQuote.quote.storedCouponCode, expectedTotal: firstQuote.quote.expectedTotal }),
      { ip: nextIp() },
    );
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) return;
    expect(await orderByNumber(first.orderNumber)).toMatchObject({
      couponId: ids.coupon,
      couponCode: "TESTCOUPON",
      couponDiscount: "200.00",
      total: "1800.00",
    });
    const usages = await db
      .select()
      .from(couponUsages)
      .where(and(eq(couponUsages.couponId, ids.coupon), eq(couponUsages.customerKey, "923009999999")));
    expect(usages).toHaveLength(1);
    expect((await db.select().from(coupons).where(eq(coupons.id, ids.coupon)))[0].usedCount).toBe(1);

    // The checkout summary drops the code as soon as the phone is entered again...
    const secondQuote = await quoteCart(cart, { ip: nextIp() });
    expect(secondQuote.ok && secondQuote.quote.coupon).toMatchObject({ status: "rejected", reason: "COUPON_PER_CUSTOMER_LIMIT" });
    expect(secondQuote.ok && secondQuote.quote.storedCouponCode).toBeNull();

    // ...and a request that keeps sending it anyway is refused under lock.
    const second = await createOrder(input({ phone: "+92 300 9999999", couponCode: "TESTCOUPON", expectedTotal: "1800.00" }), { ip: nextIp() });
    expect(second).toEqual({ ok: false, error: "You have already used this coupon. Please remove the coupon and try again." });

    const other = await createOrder(input({ phone: "0300 8888888", couponCode: "TESTCOUPON", expectedTotal: "1800.00" }), { ip: nextIp() });
    expect(other).toMatchObject({ ok: true });
  });

  it("blocks the 11th checkout attempt from one IP inside the window", async () => {
    const ip = nextIp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await createOrder(input({ expectedTotal: "1.00" }), { ip });
      expect(result).toEqual({ ok: false, error: PRICES_CHANGED_MESSAGE });
    }
    expect(await createOrder(input(), { ip })).toEqual({ ok: false, error: "Too many attempts. Please try again in a few minutes." });
  });

  describe("tracking and the order page", () => {
    let orderNumber = "";

    beforeAll(async () => {
      const placed = await createOrder(input({ phone: "0300 5555555", paymentMethod: "bank_transfer" }), { ip: nextIp() });
      if (!placed.ok) throw new Error(placed.error);
      orderNumber = placed.orderNumber;
    });

    it("opens the order for the right order number and phone, however they are spelled", async () => {
      expect(await trackOrder({ orderNumber: orderNumber.toLowerCase(), phone: "+92 300-5555555" }, { ip: nextIp() })).toEqual({
        ok: true,
        orderNumber,
      });
    });

    it("says nothing more than not found for a wrong phone or a wrong order number", async () => {
      const notFound = { ok: false, error: "We couldn't find an order with that order number and phone number." };
      expect(await trackOrder({ orderNumber, phone: "0300 5555556" }, { ip: nextIp() })).toEqual(notFound);
      expect(await trackOrder({ orderNumber: "RSH-260101-ZZZZ", phone: "0300 5555555" }, { ip: nextIp() })).toEqual(notFound);
    });

    it("reads the order page's view live from the database", async () => {
      const view = await getCustomerOrder(orderNumber);
      expect(view).toMatchObject({
        orderNumber,
        headline: "Waiting for delivery charge",
        paymentMethod: "bank_transfer",
        customer: { name: "Test Customer", phone: "+92 300 5555555", email: null },
        address: ["House 1, Street 2, DHA Phase 6", "Karachi", "Pakistan"],
        items: [{ name: "Test Plate", variantLabel: null, quantity: 2, unitPrice: "PKR 1,000", lineTotal: "PKR 2,000" }],
        totals: { subtotal: "PKR 2,000", discountTotal: null, coupon: null, delivery: { status: "pending" }, total: "PKR 2,000" },
      });
      expect(view?.timeline[0]).toEqual({ label: "Waiting for delivery charge", state: "current", note: null });
      expect(await getCustomerOrder("RSH-260101-ZZZZ")).toBeNull();
    });
  });
});
