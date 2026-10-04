import { and, asc, count, desc, eq, gt, gte, inArray, isNull, like, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias, unionAll } from "drizzle-orm/mysql-core";
import { normalizePhone } from "@/lib/phone";
import { db, type DbClient } from "@/server/db/client";
import { users } from "@/server/db/schema/access-control";
import { productVariants } from "@/server/db/schema/catalog";
import { orderItems, orderStatusHistory, orders, paymentProofs } from "@/server/db/schema/orders";
import { couponUsages, coupons } from "@/server/db/schema/promotions";
import type { PaymentMethod } from "./status";
import type { OrderTab } from "./transitions";
import { likeContains } from "@/lib/sql-like";

export type OrderUpdate = Partial<typeof orders.$inferInsert>;
export type ProofRow = typeof paymentProofs.$inferSelect;

const contains = likeContains;

/**
 * Each tab in SQL, within one payment method's page: the same rules as `orderTab` in
 * transitions.ts (checked over every enum combination by the integration tests).
 */
export const TAB_CONDITIONS: Record<OrderTab, SQL | undefined> = {
  need_review: or(
    eq(orders.orderStatus, "awaiting_shipping_quote"),
    and(eq(orders.paymentMethod, "cod"), eq(orders.orderStatus, "pending")),
  ),
  pending_delivery: and(eq(orders.paymentMethod, "bank_transfer"), eq(orders.orderStatus, "pending")),
  processing: inArray(orders.orderStatus, ["confirmed", "processing"]),
  delivery: eq(orders.orderStatus, "shipped"),
  completed: eq(orders.orderStatus, "delivered"),
  cancelled: eq(orders.orderStatus, "cancelled"),
  rejected: eq(orders.orderStatus, "rejected"),
};

type ProofPurpose = ProofRow["purpose"];

/**
 * The status of the order's latest screenshot for one payment (NULL when there is none), as
 * `latestProofStates` reads it. Written out with qualified names: in a one-table select list
 * Drizzle prints columns unqualified, which would correlate `id` to the proof's own id.
 */
const latestProofStatus = (purpose: ProofPurpose) =>
  sql<ProofRow["status"] | null>`(select latest.status from payment_proofs latest where latest.order_id = orders.id and latest.purpose = ${purpose} order by latest.created_at desc, latest.id desc limit 1)`;

const proof = alias(paymentProofs, "proof");
const newer = alias(paymentProofs, "newer");

/**
 * When the order's oldest screenshot still waiting for review was uploaded: a `submitted` proof
 * that is its payment's latest (NULL when none waits). Drizzle prints an alias by its name only,
 * so the FROM clauses name the table and the alias themselves.
 */
const waitingProofAt = sql`(select min(${proof.createdAt}) from ${paymentProofs} proof where ${proof.orderId} = ${orders.id} and ${proof.status} = 'submitted' and not exists (select 1 from ${paymentProofs} newer where ${newer.orderId} = ${proof.orderId} and ${newer.purpose} = ${proof.purpose} and (${newer.createdAt} > ${proof.createdAt} or (${newer.createdAt} = ${proof.createdAt} and ${newer.id} > ${proof.id}))))`;

function searchCondition(text: string): SQL | undefined {
  const digits = text.replace(/\D/g, "");
  const phone = normalizePhone(text);
  return or(
    like(orders.orderNumber, contains(text)),
    like(orders.customerName, contains(text)),
    digits.length >= 4 ? like(orders.phone, contains(digits)) : undefined,
    phone ? eq(orders.phone, phone) : undefined,
  );
}

/**
 * One page of a method's orders, in one tab or all of them, and how many match in all. Need
 * review sorts oldest first (a work queue: nothing sits unactioned behind the newest order,
 * matching Pending delivery charge's own oldest-first rule below); every other tab is newest
 * first, since it's a record of what already happened.
 */
export async function listOrders(
  method: PaymentMethod,
  tab: OrderTab | "all",
  search: string | undefined,
  page: { limit: number; offset: number },
) {
  const where = and(eq(orders.paymentMethod, method), tab === "all" ? undefined : TAB_CONDITIONS[tab], search ? searchCondition(search) : undefined);
  const order =
    tab === "pending_delivery"
      ? [sql`${waitingProofAt} is null`, asc(waitingProofAt), desc(orders.createdAt), desc(orders.id)]
      : tab === "need_review"
        ? [asc(orders.createdAt), asc(orders.id)]
        : [desc(orders.createdAt), desc(orders.id)];
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        createdAt: orders.createdAt,
        customerName: orders.customerName,
        paymentMethod: orders.paymentMethod,
        orderStatus: orders.orderStatus,
        paymentStatus: orders.paymentStatus,
        rejectionReason: orders.rejectionReason,
        courier: orders.courier,
        trackingNote: orders.trackingNote,
        subtotal: orders.subtotal,
        discountTotal: orders.discountTotal,
        couponDiscount: orders.couponDiscount,
        shippingTotal: orders.shippingTotal,
        total: orders.total,
      })
      .from(orders)
      .where(where)
      .orderBy(...order)
      .limit(page.limit)
      .offset(page.offset),
    db.select({ count: count() }).from(orders).where(where),
  ]);
  return { rows, total: total.count };
}


/**
 * The orders whose flags (`screenshotToCheck`, `needsAction` in transitions.ts) read the latest
 * screenshots: bank orders that are not closed. A COD order's flags never look at screenshots,
 * and a cancelled or rejected order can't have one checked (`canReviewProof`).
 */
const FLAGS_READ_PROOFS = and(eq(orders.paymentMethod, "bank_transfer"), notInArray(orders.orderStatus, ["cancelled", "rejected"]));
const FLAGS_IGNORE_PROOFS = or(eq(orders.paymentMethod, "cod"), inArray(orders.orderStatus, ["cancelled", "rejected"]));

/**
 * How many orders there are per method, order status, payment status and each payment's latest
 * screenshot status: a few dozen rows at most. The two correlated screenshot subqueries run only
 * for the orders whose flags depend on them (S22 SPD-01); every other order is counted with a
 * plain GROUP BY and NULL screenshot states, which the service reads as "missing", exactly what
 * the flags ignore for those orders. Grouped by the aliases, which MySQL and MariaDB both accept.
 */
export function countOrdersByState() {
  const withProofs = db
    .select({
      paymentMethod: orders.paymentMethod,
      orderStatus: orders.orderStatus,
      paymentStatus: orders.paymentStatus,
      goods: latestProofStatus("goods").as("goods_status"),
      delivery: latestProofStatus("delivery").as("delivery_status"),
      count: count(),
    })
    .from(orders)
    .where(FLAGS_READ_PROOFS)
    .groupBy(orders.paymentMethod, orders.orderStatus, orders.paymentStatus, sql`goods_status`, sql`delivery_status`);
  const withoutProofs = db
    .select({
      paymentMethod: orders.paymentMethod,
      orderStatus: orders.orderStatus,
      paymentStatus: orders.paymentStatus,
      goods: sql<ProofRow["status"] | null>`null`.as("goods_status"),
      delivery: sql<ProofRow["status"] | null>`null`.as("delivery_status"),
      count: count(),
    })
    .from(orders)
    .where(FLAGS_IGNORE_PROOFS)
    .groupBy(orders.paymentMethod, orders.orderStatus, orders.paymentStatus);
  return unionAll(withProofs, withoutProofs);
}

/** Every screenshot of these orders (one order, or one list page), newest first, with who reviewed it. */
export function getProofsForStaff(orderIds: number[]) {
  if (orderIds.length === 0) return Promise.resolve([]);
  return db
    .select({
      id: paymentProofs.id,
      orderId: paymentProofs.orderId,
      purpose: paymentProofs.purpose,
      status: paymentProofs.status,
      rejectionReason: paymentProofs.rejectionReason,
      createdAt: paymentProofs.createdAt,
      reviewedAt: paymentProofs.reviewedAt,
      reviewerName: users.name,
    })
    .from(paymentProofs)
    .leftJoin(users, eq(users.id, paymentProofs.reviewedBy))
    .where(inArray(paymentProofs.orderId, orderIds))
    .orderBy(desc(paymentProofs.createdAt), desc(paymentProofs.id));
}

/** An order's history, newest first (an order collects a few dozen rows at most). */
export function getOrderHistory(orderId: number) {
  return db
    .select({
      id: orderStatusHistory.id,
      kind: orderStatusHistory.kind,
      fromStatus: orderStatusHistory.fromStatus,
      toStatus: orderStatusHistory.toStatus,
      note: orderStatusHistory.note,
      createdAt: orderStatusHistory.createdAt,
      userName: users.name,
    })
    .from(orderStatusHistory)
    .leftJoin(users, eq(users.id, orderStatusHistory.changedBy))
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(desc(orderStatusHistory.createdAt), desc(orderStatusHistory.id))
    .limit(200);
}

/** `SELECT … FOR UPDATE` on the order row: every staff action runs its checks under this lock. */
export async function lockOrderByNumber(tx: DbClient, orderNumber: string) {
  const [row] = await tx.select().from(orders).where(eq(orders.orderNumber, orderNumber)).for("update");
  return row;
}

export async function getProofOrderNumber(proofId: number): Promise<string | null> {
  const [row] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(paymentProofs)
    .innerJoin(orders, eq(orders.id, paymentProofs.orderId))
    .where(eq(paymentProofs.id, proofId))
    .limit(1);
  return row?.orderNumber ?? null;
}

/** Read after the order lock: every write to an order's proofs holds that lock first. */
export async function getProof(tx: DbClient, proofId: number): Promise<ProofRow | undefined> {
  const [row] = await tx.select().from(paymentProofs).where(eq(paymentProofs.id, proofId));
  return row;
}

/** The newest screenshot for one purpose, read under the order lock like `getProof`. */
export async function getLatestProof(tx: DbClient, orderId: number, purpose: ProofRow["purpose"]): Promise<ProofRow | undefined> {
  const [row] = await tx
    .select()
    .from(paymentProofs)
    .where(and(eq(paymentProofs.orderId, orderId), eq(paymentProofs.purpose, purpose)))
    .orderBy(desc(paymentProofs.createdAt), desc(paymentProofs.id))
    .limit(1);
  return row;
}

export async function updateOrder(tx: DbClient, orderId: number, values: OrderUpdate): Promise<void> {
  await tx.update(orders).set(values).where(eq(orders.id, orderId));
}

export async function updateProof(tx: DbClient, proofId: number, values: Partial<typeof paymentProofs.$inferInsert>): Promise<void> {
  await tx.update(paymentProofs).set(values).where(eq(paymentProofs.id, proofId));
}

/**
 * Puts the order's items back into variant stock, once: `stock_restored_at` is claimed first, so
 * a second call finds it set and changes nothing. Variants are updated in ascending id order,
 * the order checkout locks them in.
 */
export async function restoreStockOnce(tx: DbClient, orderId: number, now: Date): Promise<boolean> {
  const [claimed] = await tx
    .update(orders)
    .set({ stockRestoredAt: now })
    .where(and(eq(orders.id, orderId), isNull(orders.stockRestoredAt)));
  if (claimed.affectedRows === 0) return false;

  const items = await tx
    .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.variantId));
  for (const item of items) {
    await tx
      .update(productVariants)
      .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
      .where(eq(productVariants.id, item.variantId));
  }
  return true;
}

/** Gives the order's coupon use back (C4): the usage row goes and `used_count` drops by one. */
export async function releaseCouponUsage(tx: DbClient, orderId: number): Promise<boolean> {
  const [usage] = await tx.select({ couponId: couponUsages.couponId }).from(couponUsages).where(eq(couponUsages.orderId, orderId));
  if (!usage) return false;
  await tx.delete(couponUsages).where(eq(couponUsages.orderId, orderId));
  await tx
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} - 1` })
    .where(and(eq(coupons.id, usage.couponId), gt(coupons.usedCount, 0)));
  return true;
}

/**
 * Permanently removes a closed order and everything that hangs off it (owner decision, S9
 * follow-up): its coupon usage (already released by the close that got it here, this is belt and
 * braces), payment proofs, status history and items, then the order row itself. `audit_logs` rows
 * are left alone — `entity_id` is a plain string, not a foreign key, so they keep recording who
 * did what even once the order they're about is gone. Returns the proofs' file paths so the
 * caller can delete them from disk after the transaction commits.
 */
export async function deleteOrderCascade(tx: DbClient, orderId: number): Promise<{ proofFilePaths: string[] }> {
  const proofs = await tx.select({ filePath: paymentProofs.filePath }).from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
  await tx.delete(couponUsages).where(eq(couponUsages.orderId, orderId));
  await tx.delete(paymentProofs).where(eq(paymentProofs.orderId, orderId));
  await tx.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId));
  await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await tx.delete(orders).where(eq(orders.id, orderId));
  return { proofFilePaths: proofs.map((proof) => proof.filePath) };
}

// ── CSV export (S18) ────────────────────────────────────────────────────────────────────────────

export type OrderExportRow = {
  orderNumber: string;
  createdAt: Date;
  orderStatus: (typeof orders.$inferSelect)["orderStatus"];
  paymentMethod: PaymentMethod;
  paymentStatus: (typeof orders.$inferSelect)["paymentStatus"];
  customerName: string;
  phone: string;
  city: string;
  country: string;
  itemsCount: number;
  subtotal: string;
  discountTotal: string;
  shippingTotal: string | null;
  total: string;
  couponCode: string | null;
};

/** Every order matching the export's filters, newest first, capped at `limit` (+1 to detect truncation). */
export async function listOrdersForExport(filter: {
  method: PaymentMethod | "all";
  tab: OrderTab | "all";
  from: Date;
  to: Date;
  limit: number;
}): Promise<{ rows: OrderExportRow[]; truncated: boolean }> {
  const conditions = [
    filter.method === "all" ? undefined : eq(orders.paymentMethod, filter.method),
    filter.tab === "all" ? undefined : TAB_CONDITIONS[filter.tab],
    gte(orders.createdAt, filter.from),
    // `[from, to)`, like every other range in the app (S22 BUG-16).
    lt(orders.createdAt, filter.to),
  ].filter((condition): condition is SQL => condition !== undefined);
  const where = and(...conditions);

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      orderStatus: orders.orderStatus,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      customerName: orders.customerName,
      phone: orders.phone,
      city: orders.city,
      country: orders.country,
      itemsCount: sql<number>`(select count(*) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
      subtotal: orders.subtotal,
      discountTotal: orders.discountTotal,
      shippingTotal: orders.shippingTotal,
      total: orders.total,
      couponCode: orders.couponCode,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(filter.limit + 1);

  const truncated = rows.length > filter.limit;
  return { rows: truncated ? rows.slice(0, filter.limit) : rows, truncated };
}
