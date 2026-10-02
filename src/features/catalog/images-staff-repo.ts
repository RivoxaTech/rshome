/**
 * The panel's product-images CRUD (S10 phase 3b): DB access only, no business rules
 * (ARCHITECTURE.md §2) — `images-staff-service.ts` owns the max-count/path/alt rules and the audit
 * rows. Mirrors `variants-staff-repo.ts`. Also holds the whole-product delete's image cleanup
 * (`deleteImagesByProductId`), used by `products-staff-service.ts#deleteProductById`.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { productImages } from "@/server/db/schema/catalog";

export type ProductImageRow = typeof productImages.$inferSelect;
export type ProductImageUpdate = Partial<typeof productImages.$inferInsert>;

/** Takes a `DbClient` (pool or an open transaction) so a caller already inside a transaction sees its own uncommitted writes. */
export async function getImagesByProductId(client: DbClient, productId: number): Promise<ProductImageRow[]> {
  return client.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder), asc(productImages.id));
}

/** Same as `getImagesByProductId`, under `SELECT … FOR UPDATE`: every image write holds the product's whole set. */
export async function lockImagesByProductId(tx: DbClient, productId: number): Promise<ProductImageRow[]> {
  return tx.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder), asc(productImages.id)).for("update");
}

/** Unlocked: resolves an image's product so the caller can take the product lock *first* (the same lock order the product/variant writes take). */
export async function getImageProductId(id: number): Promise<number | undefined> {
  const [row] = await db.select({ productId: productImages.productId }).from(productImages).where(eq(productImages.id, id));
  return row?.productId;
}

/** A path can belong to only one row — checked across every product, not just the one being added to. */
export async function imagePathInUse(path: string): Promise<boolean> {
  const [row] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.path, path)).limit(1);
  return !!row;
}

export async function insertProductImage(tx: DbClient, values: typeof productImages.$inferInsert): Promise<number> {
  const [result] = await tx.insert(productImages).values(values);
  return result.insertId;
}

export async function updateProductImage(tx: DbClient, id: number, values: ProductImageUpdate): Promise<void> {
  await tx.update(productImages).set(values).where(eq(productImages.id, id));
}

export async function deleteProductImageRow(tx: DbClient, id: number): Promise<void> {
  await tx.delete(productImages).where(eq(productImages.id, id));
}

/** Returns the removed rows' media paths, so the caller can delete their on-disk files after commit — used by a whole-product delete. */
export async function deleteImagesByProductId(tx: DbClient, productId: number): Promise<string[]> {
  const rows = await tx.select({ path: productImages.path }).from(productImages).where(eq(productImages.productId, productId));
  await tx.delete(productImages).where(eq(productImages.productId, productId));
  return rows.map((row) => row.path);
}

/** One `UPDATE … SET sort_order = CASE id WHEN … END`, the same shape as the variant order's. */
export async function updateImageSortOrders(tx: DbClient, updates: { id: number; sortOrder: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const caseExpr = sql.join([sql`case id`, ...updates.map((u) => sql`when ${u.id} then ${u.sortOrder}`), sql`else sort_order end`], sql` `);
  await tx
    .update(productImages)
    .set({ sortOrder: caseExpr })
    .where(
      inArray(
        productImages.id,
        updates.map((u) => u.id),
      ),
    );
}
