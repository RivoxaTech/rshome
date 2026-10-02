/**
 * The panel's products CRUD (S10 phase 2): DB access only, no business rules (ARCHITECTURE.md §2)
 * — `products-staff-service.ts` owns the slug/SKU/category checks, audit rows and the delete guard.
 * Mirrors `staff-repo.ts` (categories, S10 phase 1).
 */
import { and, asc, count, desc, eq, inArray, like, ne, or, sum, type SQL } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { categories, productImages, productVariants, products } from "@/server/db/schema/catalog";
import { orderItems } from "@/server/db/schema/orders";
import type { ProductTab } from "./schemas";

export type ProductRow = typeof products.$inferSelect;
export type ProductUpdate = Partial<typeof products.$inferInsert>;
export type ProductVariantRow = typeof productVariants.$inferSelect;
export type ProductVariantUpdate = Partial<typeof productVariants.$inferInsert>;
export type ProductImageRow = typeof productImages.$inferSelect;

/** LIKE treats `%` and `_` as wildcards and `\` as its escape: a search is matched literally. */
const contains = (text: string) => `%${text.replace(/[%_]/g, "\\$&")}%`;

function searchCondition(text: string): SQL | undefined {
  return or(like(products.name, contains(text)), like(products.slug, contains(text)));
}

function statusCondition(tab: ProductTab): SQL | undefined {
  return tab === "all" ? undefined : eq(products.status, tab);
}

export type StaffProductListRow = ProductRow & { categoryName: string };

export async function listProductsPage(filter: {
  tab: ProductTab;
  q?: string;
  categoryId?: number;
  limit: number;
  offset: number;
}): Promise<{ rows: StaffProductListRow[]; total: number }> {
  const conditions = [statusCondition(filter.tab), filter.q ? searchCondition(filter.q) : undefined, filter.categoryId ? eq(products.categoryId, filter.categoryId) : undefined].filter(
    (condition): condition is SQL => condition !== undefined,
  );
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({ product: products, categoryName: categories.name })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(filter.limit)
      .offset(filter.offset),
    db.select({ count: count() }).from(products).where(where),
  ]);

  return { rows: rows.map((row) => ({ ...row.product, categoryName: row.categoryName })), total: total.count };
}

export type ProductStatusCounts = Record<ProductTab, number>;

/** One grouped count query for the tab bar; "all" is the sum. */
export async function getProductStatusCounts(): Promise<ProductStatusCounts> {
  const rows = await db.select({ status: products.status, count: count() }).from(products).groupBy(products.status);
  const counts: ProductStatusCounts = { all: 0, draft: 0, active: 0, archived: 0 };
  for (const row of rows) {
    counts[row.status] = row.count;
    counts.all += row.count;
  }
  return counts;
}

/** Stock shown on the list: the sum of active variants only (an inactive variant's stock doesn't count). */
export async function getActiveStockSumsByProductIds(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ productId: productVariants.productId, stock: sum(productVariants.stock) })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, ids), eq(productVariants.isActive, true)))
    .groupBy(productVariants.productId);
  return new Map(rows.map((row) => [row.productId, Number(row.stock ?? 0)]));
}

export async function getProductById(id: number): Promise<ProductRow | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row;
}

/** `SELECT … FOR UPDATE` on the product row: every staff write runs its checks under this lock. */
export async function lockProductById(tx: DbClient, id: number): Promise<ProductRow | undefined> {
  const [row] = await tx.select().from(products).where(eq(products.id, id)).for("update");
  return row;
}

export async function slugInUse(slug: string, excludeId?: number): Promise<boolean> {
  const where = excludeId ? and(eq(products.slug, slug), ne(products.id, excludeId)) : eq(products.slug, slug);
  const [row] = await db.select({ id: products.id }).from(products).where(where).limit(1);
  return !!row;
}

export async function insertProduct(tx: DbClient, values: typeof products.$inferInsert): Promise<number> {
  const [result] = await tx.insert(products).values(values);
  return result.insertId;
}

export async function updateProduct(tx: DbClient, id: number, values: ProductUpdate): Promise<void> {
  await tx.update(products).set(values).where(eq(products.id, id));
}

export async function deleteProduct(tx: DbClient, id: number): Promise<void> {
  await tx.delete(products).where(eq(products.id, id));
}

/** Deleted before the product row itself: neither FK has `ON DELETE CASCADE`. */
export async function deleteVariantsByProductId(tx: DbClient, productId: number): Promise<void> {
  await tx.delete(productVariants).where(eq(productVariants.productId, productId));
}

/** Returns the removed rows' media paths, so the caller can delete their on-disk files after commit. */
export async function deleteProductImagesByProductId(tx: DbClient, productId: number): Promise<string[]> {
  const rows = await tx.select({ path: productImages.path }).from(productImages).where(eq(productImages.productId, productId));
  await tx.delete(productImages).where(eq(productImages.productId, productId));
  return rows.map((row) => row.path);
}

/** A product referenced by any `order_items` row can never be deleted, only archived. */
export async function countOrderItemsByProductId(productId: number): Promise<number> {
  const [row] = await db.select({ count: count() }).from(orderItems).where(eq(orderItems.productId, productId));
  return row.count;
}

// ── The default variant ─────────────────────────────────────────────────────────────────────

/** Takes a `DbClient` (pool or an open transaction) so a caller already inside a transaction sees its own uncommitted writes. */
export async function getVariantsByProductId(client: DbClient, productId: number): Promise<ProductVariantRow[]> {
  return client.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
}

export async function lockVariantById(tx: DbClient, id: number): Promise<ProductVariantRow | undefined> {
  const [row] = await tx.select().from(productVariants).where(eq(productVariants.id, id)).for("update");
  return row;
}

export async function skuInUse(sku: string, excludeId?: number): Promise<boolean> {
  const where = excludeId ? and(eq(productVariants.sku, sku), ne(productVariants.id, excludeId)) : eq(productVariants.sku, sku);
  const [row] = await db.select({ id: productVariants.id }).from(productVariants).where(where).limit(1);
  return !!row;
}

export async function insertVariant(tx: DbClient, values: typeof productVariants.$inferInsert): Promise<number> {
  const [result] = await tx.insert(productVariants).values(values);
  return result.insertId;
}

export async function updateVariant(tx: DbClient, id: number, values: ProductVariantUpdate): Promise<void> {
  await tx.update(productVariants).set(values).where(eq(productVariants.id, id));
}

// ── The main image (phase 2: zero or one row, sort_order 0; multi-image is phase 3) ────────────
// Listing/display reuses `features/catalog/repo.ts`'s `getPrimaryImagesByProductId` (no status
// filter applies to images, so the storefront batch helper works for staff reads too); this one
// takes a `DbClient` so a write path can read it under the same transaction as its own change.

export async function getPrimaryImageByProductId(client: DbClient, productId: number): Promise<ProductImageRow | undefined> {
  const [row] = await client.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder)).limit(1);
  return row;
}

export async function insertProductImage(tx: DbClient, values: typeof productImages.$inferInsert): Promise<number> {
  const [result] = await tx.insert(productImages).values(values);
  return result.insertId;
}

export async function updateProductImage(tx: DbClient, id: number, values: Partial<typeof productImages.$inferInsert>): Promise<void> {
  await tx.update(productImages).set(values).where(eq(productImages.id, id));
}

export async function deleteProductImageRow(tx: DbClient, id: number): Promise<void> {
  await tx.delete(productImages).where(eq(productImages.id, id));
}

// ── Category options for the form ───────────────────────────────────────────────────────────

export type CategoryGroup = { parent: { id: number; name: string } | null; options: { id: number; name: string }[] };

/**
 * Active categories only, grouped by parent, for the product form's `<select>` (one level of
 * nesting). `includeId` also appends a product's *current* category even if it has since been
 * hidden, so editing a product never silently drops it from the dropdown and reassigns it on save.
 */
export async function getActiveCategoryGroups(includeId?: number): Promise<CategoryGroup[]> {
  const rows = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.id));
  const topLevel = rows.filter((row) => row.parentId === null);
  const groups: CategoryGroup[] = [];
  const ungrouped: { id: number; name: string }[] = [];

  for (const parent of topLevel) {
    const children = rows.filter((row) => row.parentId === parent.id);
    if (children.length > 0) {
      groups.push({ parent: { id: parent.id, name: parent.name }, options: children.map((child) => ({ id: child.id, name: child.name })) });
    } else {
      ungrouped.push({ id: parent.id, name: parent.name });
    }
  }

  if (includeId !== undefined && !rows.some((row) => row.id === includeId)) {
    const [current] = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.id, includeId));
    if (current) ungrouped.push({ id: current.id, name: `${current.name} (hidden)` });
  }

  if (ungrouped.length > 0) groups.unshift({ parent: null, options: ungrouped });
  return groups;
}

export async function getCategoryByIdActive(id: number): Promise<{ id: number; isActive: boolean } | undefined> {
  const [row] = await db.select({ id: categories.id, isActive: categories.isActive }).from(categories).where(eq(categories.id, id));
  return row;
}
