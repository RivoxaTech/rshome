import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { categories, productVariants, products } from "@/server/db/schema/catalog";
import { orderItems, orderStatusHistory, orders } from "@/server/db/schema/orders";
import { couponUsages, coupons } from "@/server/db/schema/promotions";

export type LockedVariantRow = typeof productVariants.$inferSelect;
type OrderInsert = typeof orders.$inferInsert;
type OrderItemInsert = typeof orderItems.$inferInsert;
type StatusHistoryInsert = typeof orderStatusHistory.$inferInsert;

export async function findOrderNumberByCheckoutToken(checkoutToken: string): Promise<string | null> {
  const [row] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.checkoutToken, checkoutToken))
    .limit(1);
  return row?.orderNumber ?? null;
}

/**
 * `SELECT … FOR UPDATE` on the variant rows only, in ascending id order so two checkouts sharing
 * items always lock in the same sequence (ARCHITECTURE.md §4.2). Product rows are read next
 * without a lock: locking through the join would lock products and categories too.
 */
export function lockVariantRows(tx: DbClient, variantIds: number[]): Promise<LockedVariantRow[]> {
  return tx.select().from(productVariants).where(inArray(productVariants.id, variantIds)).orderBy(asc(productVariants.id)).for("update");
}

/** The product columns pricing and the snapshots need, for the locked variants' products. */
export function getProductsForCheckout(tx: DbClient, productIds: number[]) {
  return tx
    .select({
      id: products.id,
      name: products.name,
      status: products.status,
      price: products.price,
      categoryId: products.categoryId,
      parentCategoryId: categories.parentId,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(inArray(products.id, productIds));
}

export type CheckoutProductRow = Awaited<ReturnType<typeof getProductsForCheckout>>[number];

export async function insertOrder(tx: DbClient, values: OrderInsert): Promise<number> {
  const [result] = await tx.insert(orders).values(values);
  return result.insertId;
}

export async function insertOrderItems(tx: DbClient, values: OrderItemInsert[]): Promise<void> {
  await tx.insert(orderItems).values(values);
}

export async function decrementVariantStock(tx: DbClient, variantId: number, quantity: number): Promise<void> {
  await tx
    .update(productVariants)
    .set({ stock: sql`${productVariants.stock} - ${quantity}` })
    .where(eq(productVariants.id, variantId));
}

export async function recordCouponUsage(tx: DbClient, couponId: number, orderId: number, customerKey: string): Promise<void> {
  await tx.insert(couponUsages).values({ couponId, orderId, customerKey });
  await tx
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} + 1` })
    .where(eq(coupons.id, couponId));
}

export async function insertStatusHistory(tx: DbClient, values: StatusHistoryInsert[]): Promise<void> {
  await tx.insert(orderStatusHistory).values(values);
}
