/**
 * The panel's variant CRUD (S10): DB access only, no business rules (ARCHITECTURE.md §2)
 * — `variants-staff-service.ts` owns the SKU/attribute/last-variant rules and the audit rows.
 * Holds every staff-side `product_variants` query, including the ones the product form itself
 * needs (the create form's "Default" variant, the product delete).
 */
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { productVariants } from "@/server/db/schema/catalog";
import { orderItems } from "@/server/db/schema/orders";

export type ProductVariantRow = typeof productVariants.$inferSelect;
type ProductVariantUpdate = Partial<typeof productVariants.$inferInsert>;

/** Takes a `DbClient` (pool or an open transaction) so a caller already inside a transaction sees its own uncommitted writes. */
export async function getVariantsByProductId(client: DbClient, productId: number): Promise<ProductVariantRow[]> {
  return client.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
}

/** Same as `getVariantsByProductId`, under `SELECT … FOR UPDATE`: every variant write holds the product's whole set. */
export async function lockVariantsByProductId(tx: DbClient, productId: number): Promise<ProductVariantRow[]> {
  return tx.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.sortOrder), asc(productVariants.id)).for("update");
}

/** Unlocked: resolves a variant's product so the caller can take the product lock *first* (the same lock order the product form uses). */
export async function getVariantProductId(id: number): Promise<number | undefined> {
  const [row] = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, id));
  return row?.productId;
}

export async function skuInUse(sku: string, excludeId?: number): Promise<boolean> {
  const where = excludeId ? and(eq(productVariants.sku, sku), ne(productVariants.id, excludeId)) : eq(productVariants.sku, sku);
  const [row] = await db.select({ id: productVariants.id }).from(productVariants).where(where).limit(1);
  return !!row;
}

/** CSV import matches a variant to update by SKU (S18), and flags a SKU already owned by a different product. */
export async function getVariantBySku(sku: string): Promise<{ id: number; productId: number } | undefined> {
  const [row] = await db.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants).where(eq(productVariants.sku, sku));
  return row;
}

export async function insertVariant(tx: DbClient, values: typeof productVariants.$inferInsert): Promise<number> {
  const [result] = await tx.insert(productVariants).values(values);
  return result.insertId;
}

export async function updateVariant(tx: DbClient, id: number, values: ProductVariantUpdate): Promise<void> {
  await tx.update(productVariants).set(values).where(eq(productVariants.id, id));
}

export async function deleteVariant(tx: DbClient, id: number): Promise<void> {
  await tx.delete(productVariants).where(eq(productVariants.id, id));
}

/** Deleted before the product row itself: neither FK has `ON DELETE CASCADE`. */
export async function deleteVariantsByProductId(tx: DbClient, productId: number): Promise<void> {
  await tx.delete(productVariants).where(eq(productVariants.productId, productId));
}

/** `order_items` rows per variant, for the delete guard (a variant that was ever ordered can only be deactivated). */
export async function countOrderItemsByVariantIds(client: DbClient, variantIds: number[]): Promise<Map<number, number>> {
  if (variantIds.length === 0) return new Map();
  const rows = await client
    .select({ variantId: orderItems.variantId, count: count() })
    .from(orderItems)
    .where(inArray(orderItems.variantId, variantIds))
    .groupBy(orderItems.variantId);
  return new Map(rows.map((row) => [row.variantId, row.count]));
}

/** One `UPDATE … SET sort_order = CASE id WHEN … END`, the same shape as the product order's. */
export async function updateVariantSortOrders(tx: DbClient, updates: { id: number; sortOrder: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const caseExpr = sql.join([sql`case id`, ...updates.map((u) => sql`when ${u.id} then ${u.sortOrder}`), sql`else sort_order end`], sql` `);
  await tx
    .update(productVariants)
    .set({ sortOrder: caseExpr })
    .where(
      inArray(
        productVariants.id,
        updates.map((u) => u.id),
      ),
    );
}
