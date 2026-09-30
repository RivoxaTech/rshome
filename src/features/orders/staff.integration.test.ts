/**
 * The panel's order work (ARCHITECTURE.md §4.3, owner decisions C20, C21) against the test database:
 * the Server Actions are called as a form would call them, with `next/headers` replaced by the
 * signed-in staff member's cookie and `refresh()` stubbed, since there is no Next server around
 * them; the tab lists and counts are read through the staff service. Skips without
 * TEST_DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimits } from "@/server/db/schema/access-control";
import { auditLogs } from "@/server/db/schema/audit";
import { productVariants } from "@/server/db/schema/catalog";
import { orderStatusHistory, orders, paymentProofs } from "@/server/db/schema/orders";
import { couponUsages, coupons } from "@/server/db/schema/promotions";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";
import type { PermissionKey } from "@/features/auth/permissions";
import type { PaymentMethod } from "./status";
import { deliveryScreenshotToCheck, needsAction, orderTab, tabsFor, type OrderTab } from "./transitions";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const ADMIN = ["order.view", "order.update_status", "order.verify_payment", "order.set_shipping"];

type Db = typeof import("@/server/db/client");
type Actions = typeof import("@/app/panel/(protected)/orders/actions");
type StaffService = typeof import("./staff-service");

describe.skipIf(!TEST_DATABASE_URL)("panel order work (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let actions: Actions;
  let staff: StaffService;
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let uploadOrderProof: typeof import("@/features/payments/service").uploadOrderProof;
  let getCustomerOrder: typeof import("./service").getCustomerOrder;
  let encodeProofToken: typeof import("@/features/payments/proof-token").encodeProofToken;
  let savePendingProof: typeof import("@/server/storage/proofs").savePendingProof;
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let secret: string;

  let ids: FixtureIds;
  let adminId: number;
  let adminToken: string;
  let ipCounter = 0;
  const nextIp = () => `staff-ip-${++ipCounter}`;

  const screenshot = () =>
    sharp({ create: { width: 600, height: 1200, channels: 3, background: "#d8c8a8" } })
      .png()
      .toBuffer();

  const form = (values: Record<string, string | number>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  const orderRow = async (orderNumber: string) => (await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)))[0];
  const proofsOf = async (orderId: number) => db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId)).orderBy(paymentProofs.id);
  const historyOf = async (orderId: number) => db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)).orderBy(orderStatusHistory.id);
  const stockOf = async (variantId: number) =>
    (await db.select({ stock: productVariants.stock }).from(productVariants).where(eq(productVariants.id, variantId)))[0].stock;
  const usedCount = async () => (await db.select({ usedCount: coupons.usedCount }).from(coupons).where(eq(coupons.id, ids.coupon)))[0].usedCount;

  const adminPermissions = new Set(ADMIN as PermissionKey[]);

  /** Which tab of its method's page lists this order, read through the list queries (exactly one, and All too). */
  async function tabOf(orderNumber: string, method: PaymentMethod): Promise<OrderTab> {
    const found: OrderTab[] = [];
    for (const tab of tabsFor(method)) {
      const { items } = await staff.listStaffOrders(method, tab, { q: orderNumber, page: 1 }, adminPermissions);
      if (items.length > 0) found.push(tab);
    }
    expect(found).toHaveLength(1);
    expect((await staff.listStaffOrders(method, "all", { q: orderNumber, page: 1 }, adminPermissions)).items).toHaveLength(1);
    return found[0];
  }

  /** The order's row on the All tab, with its status pill's steps. */
  async function rowOf(orderNumber: string, method: PaymentMethod, permissions: ReadonlySet<PermissionKey> = adminPermissions) {
    const [row] = (await staff.listStaffOrders(method, "all", { q: orderNumber, page: 1 }, permissions)).items;
    return row;
  }

  const stepsOf = async (orderNumber: string, method: PaymentMethod) => (await rowOf(orderNumber, method)).control.actions.map(({ action }) => action);

  async function placeOrder(overrides: Record<string, unknown> = {}): Promise<{ id: number; orderNumber: string }> {
    const placed = await createOrder(checkoutInput(ids, overrides), { ip: nextIp() });
    if (!placed.ok) throw new Error(placed.error);
    const row = await orderRow(placed.orderNumber);
    return { id: row.id, orderNumber: row.orderNumber };
  }

  /** A bank order as checkout places it: products screenshot in, not yet approved. */
  async function placeBankOrder(overrides: Record<string, unknown> = {}) {
    const fileName = await savePendingProof(await sharp(await screenshot()).webp().toBuffer());
    return placeOrder({ paymentMethod: "bank_transfer", proofToken: encodeProofToken(fileName, new Date(Date.now() + 60_000), secret), ...overrides });
  }

  const approve = (orderNumber: string, amount?: string, note = "") =>
    actions.approveOrderAction(null, form(amount === undefined ? { orderNumber, note } : { orderNumber, amount, note }));
  const review = (proofId: number, decision: "approve" | "reject", reason?: string) =>
    actions.reviewProofAction(null, form(reason === undefined ? { proofId, decision } : { proofId, decision, reason }));
  const fulfil = (orderNumber: string, status: string, extra: Record<string, string> = {}) =>
    actions.updateFulfilmentAction(null, form({ orderNumber, status, ...extra }));
  const close = (orderNumber: string, action: "reject" | "cancel", reason: string) => actions.closeOrderAction(null, form({ orderNumber, action, reason }));
  const latestProofId = async (orderId: number, purpose: "goods" | "delivery") =>
    (await proofsOf(orderId)).filter((proof) => proof.purpose === purpose).at(-1)!.id;

  async function customerUploads(orderNumber: string, purpose: "goods" | "delivery") {
    const png = await screenshot();
    const result = await uploadOrderProof(
      { orderNumber, purpose, readFile: async () => new File([new Uint8Array(png)], "transfer.png", { type: "image/png" }) },
      { ip: nextIp() },
    );
    expect(result).toEqual({ ok: true });
  }

  beforeAll(async () => {
    const [client, actionModule, staffModule, checkout, payments, orderService, token, storage, session, envModule] = await Promise.all([
      import("@/server/db/client"),
      import("@/app/panel/(protected)/orders/actions"),
      import("./staff-service"),
      import("@/features/checkout/service"),
      import("@/features/payments/service"),
      import("./service"),
      import("@/features/payments/proof-token"),
      import("@/server/storage/proofs"),
      import("@/server/auth/session"),
      import("@/server/env"),
    ]);
    db = client.db;
    pool = client.pool;
    actions = actionModule;
    staff = staffModule;
    createOrder = checkout.createOrder;
    uploadOrderProof = payments.uploadOrderProof;
    getCustomerOrder = orderService.getCustomerOrder;
    encodeProofToken = token.encodeProofToken;
    savePendingProof = storage.savePendingProof;
    hashToken = session.hashToken;
    secret = envModule.env.SESSION_SECRET;

    assertTestDatabase();
    await resetTables(db);
    ids = await seedFixtures(db);
    ({ userId: adminId, token: adminToken } = await createStaffSession(db, hashToken, ADMIN));
  });

  beforeEach(async () => {
    await db.delete(rateLimits);
    current.cookies.set("panel_session", adminToken);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("takes a bank order through every tab: need review, pending delivery charge, processing, delivery, completed", async () => {
    const order = await placeBankOrder();
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("need_review");
    expect(await stepsOf(order.orderNumber, "bank_transfer")).toEqual(["approve", "cancel", "reject"]);

    // Approve is refused until a delivery charge is entered.
    expect(await approve(order.orderNumber)).toMatchObject({ ok: false, fieldErrors: { amount: "Enter the delivery charge first." } });
    expect(await approve(order.orderNumber, "12.50")).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(String) } });
    expect(await approve(order.orderNumber, "1,450", "2 cartons, TCS")).toEqual({ ok: true });

    expect(await orderRow(order.orderNumber)).toMatchObject({
      orderStatus: "pending",
      paymentStatus: "unpaid",
      shippingTotal: "1450.00",
      shippingNote: "2 cartons, TCS",
      total: "3450.00",
      displayTotal: "3450.00",
    });
    expect((await proofsOf(order.id))[0]).toMatchObject({ purpose: "goods", status: "verified", reviewedBy: adminId });
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("pending_delivery");
    // Waiting for the customer: nothing forward is offered.
    expect(await stepsOf(order.orderNumber, "bank_transfer")).toEqual(["cancel", "reject"]);
    expect((await rowOf(order.orderNumber, "bank_transfer")).screenshotToCheck).toBe(false);
    expect((await historyOf(order.id)).slice(-2)).toMatchObject([
      { kind: "order", fromStatus: "awaiting_shipping_quote", toStatus: "pending", note: "Approved. Delivery charge PKR 1,450 (2 cartons, TCS)", changedBy: adminId },
      { kind: "payment", fromStatus: "proof_submitted", toStatus: "unpaid", changedBy: adminId },
    ]);
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.userId, adminId));
    expect(audits.find((row) => row.action === "order.approve" && row.entityId === order.orderNumber)).toBeDefined();
    expect(audits.filter((row) => row.action === "payment.approve" && JSON.parse(row.newValues!).orderNumber === order.orderNumber)).toHaveLength(1);
    expect(await approve(order.orderNumber, "500")).toEqual({ ok: false, error: "This order is already approved." });
    expect((await getCustomerOrder(order.orderNumber))?.headline).toBe("Order approved – please pay the delivery charge of PKR 1,450");

    await customerUploads(order.orderNumber, "delivery");
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("pending_delivery");
    expect((await rowOf(order.orderNumber, "bank_transfer")).screenshotToCheck).toBe(true);
    expect(await stepsOf(order.orderNumber, "bank_transfer")).toEqual(["check_delivery", "cancel", "reject"]);
    expect(await review(await latestProofId(order.id, "delivery"), "approve")).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "processing", paymentStatus: "verified" });
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("processing");
    expect(await stepsOf(order.orderNumber, "bank_transfer")).toEqual(["ship", "complete", "cancel", "reject"]);

    expect(await fulfil(order.orderNumber, "shipped")).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "shipped", courier: null, trackingNote: null });
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("delivery");
    expect(await stepsOf(order.orderNumber, "bank_transfer")).toEqual(["complete"]);
    expect(await fulfil(order.orderNumber, "shipped")).toEqual({ ok: false, error: "This order can't be marked sent now." });
    expect(await fulfil(order.orderNumber, "delivered")).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "delivered", paymentStatus: "verified" });
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("completed");
    expect(await stepsOf(order.orderNumber, "bank_transfer")).toEqual([]);
    expect(await close(order.orderNumber, "cancel", "Too late")).toEqual({ ok: false, error: "An order that has been delivered can't be cancelled." });
  });

  it("sends a bank order with a zero delivery charge straight to processing", async () => {
    const order = await placeBankOrder();
    expect(await approve(order.orderNumber, "0")).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "processing", paymentStatus: "verified", shippingTotal: "0.00", total: "2000.00" });
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("processing");
  });

  it("takes a COD order from need review to completed, with the courier, and records the cash as collected", async () => {
    const order = await placeOrder();
    expect(await tabOf(order.orderNumber, "cod")).toBe("need_review");
    expect(await stepsOf(order.orderNumber, "cod")).toEqual(["approve", "cancel", "reject"]);
    expect(await approve(order.orderNumber, "300")).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "processing", paymentStatus: "cod_pending", shippingTotal: "300.00", total: "2300.00" });
    expect(await tabOf(order.orderNumber, "cod")).toBe("processing");
    expect((await getCustomerOrder(order.orderNumber))?.headline).toBe("Order approved");

    expect(await fulfil(order.orderNumber, "shipped", { courier: "TCS", trackingNote: "CN 123456" })).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "shipped", courier: "TCS", trackingNote: "CN 123456" });
    expect(await fulfil(order.orderNumber, "delivered")).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "delivered", paymentStatus: "cod_collected" });
    expect((await historyOf(order.id)).slice(-2)).toMatchObject([
      { kind: "order", fromStatus: "shipped", toStatus: "delivered" },
      { kind: "payment", fromStatus: "cod_pending", toStatus: "cod_collected", note: "Cash collected on delivery" },
    ]);
  });

  it("rejects each screenshot with a reason the customer sees, and takes a new upload", async () => {
    const order = await placeBankOrder();
    const goodsId = await latestProofId(order.id, "goods");

    expect(await review(goodsId, "reject", " ")).toMatchObject({ ok: false, fieldErrors: { reason: "Enter a reason." } });
    expect(await review(goodsId, "reject", "Amount does not match")).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "awaiting_shipping_quote", paymentStatus: "rejected" });
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("need_review");
    expect(await stepsOf(order.orderNumber, "bank_transfer")).toEqual(["cancel", "reject"]);
    expect((await rowOf(order.orderNumber, "bank_transfer")).control.waiting).toBe("Waiting for a new payment screenshot");
    expect(await approve(order.orderNumber, "450")).toEqual({ ok: false, error: "Waiting for a new payment screenshot from the customer." });
    expect((await getCustomerOrder(order.orderNumber))?.payment.upload).toMatchObject({ purpose: "goods", rejectionReason: "Amount does not match" });

    await customerUploads(order.orderNumber, "goods");
    expect((await orderRow(order.orderNumber)).paymentStatus).toBe("proof_submitted");
    // The products screenshot is approved with the order, not on its own.
    expect(await review(await latestProofId(order.id, "goods"), "approve")).toEqual({ ok: false, error: "Enter the delivery charge and tap Approve order." });
    expect(await approve(order.orderNumber, "450")).toEqual({ ok: true });

    await customerUploads(order.orderNumber, "delivery");
    expect(await review(await latestProofId(order.id, "delivery"), "reject", "Wrong account")).toEqual({ ok: true });
    expect(await orderRow(order.orderNumber)).toMatchObject({ orderStatus: "pending", paymentStatus: "rejected" });
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("pending_delivery");
    expect((await getCustomerOrder(order.orderNumber))?.payment.upload).toMatchObject({ purpose: "delivery", rejectionReason: "Wrong account" });

    await customerUploads(order.orderNumber, "delivery");
    expect(await tabOf(order.orderNumber, "bank_transfer")).toBe("pending_delivery");
    expect((await rowOf(order.orderNumber, "bank_transfer")).screenshotToCheck).toBe(true);
    expect((await proofsOf(order.id)).map((proof) => `${proof.purpose}:${proof.status}`)).toEqual([
      "goods:rejected",
      "goods:verified",
      "delivery:rejected",
      "delivery:submitted",
    ]);
  });

  it("rejects an order with a reason: the stock comes back once and the coupon use is released", async () => {
    const stockBefore = await stockOf(ids.plate);
    const order = await placeOrder({ phone: "0300 7654321", couponCode: "TESTCOUPON", expectedTotal: "1800.00" });
    expect(await stockOf(ids.plate)).toBe(stockBefore - 2);
    expect(await usedCount()).toBe(1);

    expect(await approve(order.orderNumber, "300")).toEqual({ ok: true });
    expect(await close(order.orderNumber, "reject", " ")).toMatchObject({ ok: false, fieldErrors: { reason: "Enter a reason." } });
    expect(await close(order.orderNumber, "reject", "Item damaged at the shop")).toEqual({ ok: true });

    const row = await orderRow(order.orderNumber);
    expect(row).toMatchObject({ orderStatus: "rejected", rejectionReason: "Item damaged at the shop" });
    expect(row.stockRestoredAt).not.toBeNull();
    expect(await stockOf(ids.plate)).toBe(stockBefore);
    expect(await db.select().from(couponUsages).where(eq(couponUsages.orderId, order.id))).toEqual([]);
    expect(await usedCount()).toBe(0);
    expect(await tabOf(order.orderNumber, "cod")).toBe("rejected");
    expect((await getCustomerOrder(order.orderNumber))?.timeline.at(-1)).toMatchObject({ label: "Rejected", note: "Item damaged at the shop" });

    // A second reject or cancel is refused and changes nothing.
    expect(await close(order.orderNumber, "reject", "Again")).toEqual({ ok: false, error: "This order is already closed." });
    expect(await close(order.orderNumber, "cancel", "Again")).toEqual({ ok: false, error: "This order is already closed." });
    expect(await stockOf(ids.plate)).toBe(stockBefore);

    // Even if the order were reopened by hand, `stock_restored_at` stops a second restore.
    await db.update(orders).set({ orderStatus: "processing" }).where(eq(orders.id, order.id));
    expect(await close(order.orderNumber, "cancel", "Reopened by mistake")).toEqual({ ok: true });
    expect(await stockOf(ids.plate)).toBe(stockBefore);
    expect(await usedCount()).toBe(0);
  });

  /** Inserts an order straight into the table, in any state (the flow can't reach some of them). */
  async function insertOrder(values: { orderNumber: string; customerName: string } & Pick<typeof orders.$inferInsert, "paymentMethod" | "orderStatus" | "paymentStatus" | "createdAt">) {
    const [result] = await db.insert(orders).values({
      checkoutToken: randomUUID(),
      phone: "923009999999",
      addressLine: "Test",
      city: "Karachi",
      country: "PK",
      subtotal: "100.00",
      discountTotal: "0.00",
      couponDiscount: "0.00",
      total: "100.00",
      displayCurrency: "PKR",
      exchangeRate: "1.0000",
      displayTotal: "100.00",
      ...values,
    });
    return result.insertId;
  }

  /** Every order number a tab lists for a search, across all its pages. */
  async function listedIn(method: PaymentMethod, tab: OrderTab | "all", q: string): Promise<string[]> {
    const listed: string[] = [];
    for (let page = 1, pageCount = 1; page <= pageCount; page += 1) {
      const result = await staff.listStaffOrders(method, tab, { q, page }, adminPermissions);
      pageCount = result.pageCount;
      listed.push(...result.items.map((item) => item.orderNumber));
    }
    return listed;
  }

  it("lists every combination of method, order status and payment status in exactly one tab of its method's page, and counts them", async () => {
    const before = await staff.getOrderCounts();
    const expected = new Map<string, { method: PaymentMethod; tab: OrderTab; toCheck: boolean; needsAction: boolean }>();
    let n = 0;
    for (const paymentMethod of orders.paymentMethod.enumValues) {
      for (const orderStatus of orders.orderStatus.enumValues) {
        for (const paymentStatus of orders.paymentStatus.enumValues) {
          const orderNumber = `QQQ-000000-${String(++n).padStart(4, "0")}`;
          const state = { paymentMethod, orderStatus, paymentStatus };
          expected.set(orderNumber, { method: paymentMethod, tab: orderTab(state), toCheck: deliveryScreenshotToCheck(state), needsAction: needsAction(state) });
          await insertOrder({ orderNumber, customerName: "Tab Combination", ...state });
        }
      }
    }

    const after = await staff.getOrderCounts();
    for (const method of orders.paymentMethod.enumValues) {
      const mine = [...expected].filter(([, order]) => order.method === method);
      for (const tab of [...tabsFor(method), "all"] as const) {
        const wanted = mine.filter(([, order]) => tab === "all" || order.tab === tab).map(([orderNumber]) => orderNumber);
        expect((await listedIn(method, tab, "Tab Combination")).sort(), `${method} ${tab}`).toEqual(wanted.sort());
        expect(after[method][tab] - before[method][tab], `${method} ${tab} count`).toBe(wanted.length);
      }
      expect(after[method].toCheck - before[method].toCheck, `${method} screenshots to check`).toBe(mine.filter(([, order]) => order.toCheck).length);
      expect(after[method].needsAction - before[method].needsAction, `${method} needing action`).toBe(mine.filter(([, order]) => order.needsAction).length);
    }
    // Every order sits in one tab: the tabs' counts add up to All.
    for (const method of orders.paymentMethod.enumValues) {
      expect(tabsFor(method).reduce((sum, tab) => sum + after[method][tab], 0)).toBe(after[method].all);
    }
  });

  it("lists Pending delivery charge with the screenshots to check first, oldest upload first, then the rest newest first", async () => {
    const at = (minutes: number) => new Date(Date.UTC(2026, 8, 1, 10, minutes));
    const proof = (orderId: number, status: "submitted" | "rejected", minutes: number) =>
      db.insert(paymentProofs).values({ orderId, purpose: "delivery", status, filePath: `proofs/test/${randomUUID()}.webp`, fileSize: 1, createdAt: at(minutes) });
    const pending = (orderNumber: string, paymentStatus: "unpaid" | "rejected" | "proof_submitted", createdMinutes: number) =>
      insertOrder({ orderNumber, customerName: "Sort Check", paymentMethod: "bank_transfer", orderStatus: "pending", paymentStatus, createdAt: at(createdMinutes) });

    await pending("SRT-000000-000A", "unpaid", 0);
    await pending("SRT-000000-000B", "unpaid", 4);
    await proof(await pending("SRT-000000-000C", "proof_submitted", 1), "submitted", 9);
    const d = await pending("SRT-000000-000D", "proof_submitted", 3);
    await proof(d, "rejected", 5);
    await proof(d, "submitted", 6);
    await pending("SRT-000000-000E", "rejected", 2);

    const { items } = await staff.listStaffOrders("bank_transfer", "pending_delivery", { q: "Sort Check", page: 1 }, adminPermissions);
    expect(items.map((item) => [item.orderNumber, item.screenshotToCheck])).toEqual([
      ["SRT-000000-000D", true],
      ["SRT-000000-000C", true],
      ["SRT-000000-000B", false],
      ["SRT-000000-000E", false],
      ["SRT-000000-000A", false],
    ]);
    expect(items.map((item) => item.serial)).toEqual([1, 2, 3, 4, 5]);
  });

  it("adds an internal note to the history", async () => {
    const order = await placeOrder();
    expect(await actions.addOrderNoteAction(null, form({ orderNumber: order.orderNumber, note: "Customer asked for gift wrap" }))).toEqual({ ok: true });
    expect((await historyOf(order.id)).at(-1)).toMatchObject({ kind: "note", note: "Customer asked for gift wrap", changedBy: adminId });
  });

  it("refuses every action to staff without its permission, and to a signed-out request", async () => {
    const order = await placeBankOrder();
    const proofId = await latestProofId(order.id, "goods");
    const before = await orderRow(order.orderNumber);
    const historyBefore = (await historyOf(order.id)).length;
    const attempts = [
      () => approve(order.orderNumber, "450"),
      () => review(proofId, "reject", "No permission"),
      () => fulfil(order.orderNumber, "shipped"),
      () => close(order.orderNumber, "cancel", "No permission"),
      () => actions.addOrderNoteAction(null, form({ orderNumber: order.orderNumber, note: "No permission" })),
    ];

    // The status pill offers only the steps the viewer may take (the actions still check for themselves).
    expect((await rowOf(order.orderNumber, "bank_transfer", new Set<PermissionKey>(["order.view"]))).control.actions).toEqual([]);
    const withoutShipping = new Set<PermissionKey>(["order.view", "order.verify_payment", "order.update_status"]);
    expect((await rowOf(order.orderNumber, "bank_transfer", withoutShipping)).control.actions.map(({ action }) => action)).toEqual(["cancel", "reject"]);

    current.cookies.set("panel_session", (await createStaffSession(db, hashToken, ["order.view"])).token);
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ digest: expect.stringContaining(";/panel/403;") });

    // Approving needs all three of its permissions: without order.set_shipping it is refused.
    current.cookies.set("panel_session", (await createStaffSession(db, hashToken, ["order.view", "order.verify_payment", "order.update_status"])).token);
    await expect(attempts[0]()).rejects.toMatchObject({ digest: expect.stringContaining(";/panel/403;") });

    current.cookies.delete("panel_session");
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ digest: expect.stringContaining(";/panel/login;") });

    expect(await orderRow(order.orderNumber)).toEqual(before);
    expect((await proofsOf(order.id))[0].status).toBe("submitted");
    expect(await historyOf(order.id)).toHaveLength(historyBefore);
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, order.orderNumber), eq(auditLogs.action, "order.approve")))).toEqual([]);
  });
});
