import { and, asc, count, desc, eq, gt, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";
import { db, type DbClient } from "@/server/db/client";
import { users } from "@/server/db/schema/access-control";
import { productVariants } from "@/server/db/schema/catalog";
import { orderItems, orderStatusHistory, orders, paymentProofs } from "@/server/db/schema/orders";
import { couponUsages, coupons } from "@/server/db/schema/promotions";
import type { PaymentMethod } from "./status";
import type { OrderTab } from "./transitions";

export type OrderUpdate = Partial<typeof orders.$inferInsert>;
export type ProofRow = typeof paymentProofs.$inferSelect;

/** LIKE treats `%` and `_` as wildcards and `\` as its escape: a search is matched literally. */
const contains = (text: string) => `%${text.replace(/[\%_]/g, "\$&")}%`;

/**
 * Each tab in SQL, within one payment method's page: the same rules as `orderTab` in
 * transitions.ts (checked over every enum combination by the integration tests).
 */
const TAB_CONDITIONS: Record<OrderTab, SQL | undefined> = {
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

/** When the order's screenshot now waiting for review was uploaded (NULL when none waits). */
const submittedProofAt = sql`(select max(${paymentProofs.createdAt}) from ${paymentProofs} where ${paymentProofs.orderId} = ${orders.id} and ${paymentProofs.status} = 'submitted')`;

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
 * One page of a method's orders, in one tab or all of them, and how many match in all. Newest
 * first, except Pending delivery charge: the delivery charge screenshots to check come first,
 * oldest upload first, then the orders still waiting for the customer.
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
      ? [sql`${orders.paymentStatus} = 'proof_submitted' desc`, asc(submittedProofAt), desc(orders.createdAt), desc(orders.id)]
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


/** How many orders there are per (method, order status, payment status): a few dozen rows at most. */
export function countOrdersByState() {
  return db
    .select({ paymentMethod: orders.paymentMethod, orderStatus: orders.orderStatus, paymentStatus: orders.paymentStatus, count: count() })
    .from(orders)
    .groupBy(orders.paymentMethod, orders.orderStatus, orders.paymentStatus);
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
