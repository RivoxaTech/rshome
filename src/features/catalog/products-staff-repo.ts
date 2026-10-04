/**
 * The panel's products CRUD (S10): DB access only, no business rules (ARCHITECTURE.md §2)
 * — `products-staff-service.ts` owns the slug/SKU/category checks, audit rows and the delete guard.
 * Mirrors `staff-repo.ts` (categories, S10). Variant queries moved to
 * `variants-staff-repo.ts` in phase 3a.
 */
import { and, asc, count, desc, eq, inArray, like, max, ne, or, sql, sum, type SQL } from "drizzle-orm";
// Variant queries (incl. the create form's "Default" variant) live in `variants-staff-repo.ts` (S10
// phase 3a); image queries (incl. the whole-product delete's image cleanup) live in
// `images-staff-repo.ts` (S10).
import { db, type DbClient } from "@/server/db/client";
import { categories, productVariants, products } from "@/server/db/schema/catalog";
import { orderItems } from "@/server/db/schema/orders";
import type { ProductTab } from "./schemas";
import { likeContains } from "@/lib/sql-like";

export type ProductRow = typeof products.$inferSelect;
type ProductUpdate = Partial<typeof products.$inferInsert>;

const contains = likeContains;

function searchCondition(text: string): SQL | undefined {
  return or(like(products.name, contains(text)), like(products.slug, contains(text)));
}

function statusCondition(tab: ProductTab): SQL | undefined {
  return tab === "all" ? undefined : eq(products.status, tab);
}

// `parentCategoryId` is needed to resolve a category-targeted discount against a product in a
// child category (features/pricing/pricing.ts#discountMatchesProduct checks both levels).
type StaffProductListRow = ProductRow & { categoryName: string; parentCategoryId: number | null };

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
      .select({ product: products, categoryName: categories.name, parentCategoryId: categories.parentId })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(filter.limit)
      .offset(filter.offset),
    db.select({ count: count() }).from(products).where(where),
  ]);

  return { rows: rows.map((row) => ({ ...row.product, categoryName: row.categoryName, parentCategoryId: row.parentCategoryId })), total: total.count };
}

// ── CSV export (S18): one row per variant, product columns repeated ────────────────────────────

export type ProductExportRow = {
  name: string;
  slug: string;
  categorySlug: string;
  status: ProductRow["status"];
  shortDescription: string | null;
  description: string | null;
  isFeatured: boolean;
  price: string;
  sku: string;
  label: string;
  attributes: string;
  stock: number;
  priceOverride: string | null;
  isActive: boolean;
};

export async function listProductsForExport(filter: { tab: ProductTab; q?: string; categoryId?: number; limit: number }): Promise<{ rows: ProductExportRow[]; truncated: boolean }> {
  const conditions = [statusCondition(filter.tab), filter.q ? searchCondition(filter.q) : undefined, filter.categoryId ? eq(products.categoryId, filter.categoryId) : undefined].filter(
    (condition): condition is SQL => condition !== undefined,
  );
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      name: products.name,
      slug: products.slug,
      categorySlug: categories.slug,
      status: products.status,
      shortDescription: products.shortDescription,
      description: products.description,
      isFeatured: products.isFeatured,
      price: products.price,
      sku: productVariants.sku,
      label: productVariants.label,
      attributes: productVariants.attributes,
      stock: productVariants.stock,
      priceOverride: productVariants.priceOverride,
      isActive: productVariants.isActive,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(asc(products.id), asc(productVariants.sortOrder))
    .limit(filter.limit + 1);

  const truncated = rows.length > filter.limit;
  return { rows: truncated ? rows.slice(0, filter.limit) : rows, truncated };
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

/** The last positions of the shop and featured orders (-1 when empty), so a bulk import can append without a full renumber (S22 BUG-10). */
export async function getMaxSortOrders(tx: DbClient): Promise<{ shop: number; featured: number }> {
  const [row] = await tx.select({ shop: max(products.sortOrder), featured: max(products.featuredSortOrder) }).from(products);
  return { shop: row?.shop ?? -1, featured: row?.featured ?? -1 };
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

/** A product referenced by any `order_items` row can never be deleted, only archived. */
export async function countOrderItemsByProductId(productId: number): Promise<number> {
  const [row] = await db.select({ count: count() }).from(orderItems).where(eq(orderItems.productId, productId));
  return row.count;
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

/** CSV import matches a row's category by slug (S18), same active-only rule as `getCategoryByIdActive`. */
export async function getCategoryBySlugActive(slug: string): Promise<{ id: number; isActive: boolean } | undefined> {
  const [row] = await db.select({ id: categories.id, isActive: categories.isActive }).from(categories).where(eq(categories.slug, slug));
  return row;
}

/** CSV import matches a product to update by slug (S18), never by id — the file never carries one. */
export async function getProductBySlug(slug: string): Promise<ProductRow | undefined> {
  const [row] = await db.select().from(products).where(eq(products.slug, slug));
  return row;
}

/** For category-targeted discount matching against a product's own category or its parent. */
export async function getCategoryParentId(categoryId: number): Promise<number | null> {
  const [row] = await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, categoryId));
  return row?.parentId ?? null;
}

// ── Manual ordering (S10): shop order (global) / featured order (featured+active only) ─

/** Every product id in shop-order, optionally scoped to one category (its own relative order). */
export async function getOrderedProductIds(client: DbClient, categoryId?: number): Promise<number[]> {
  const where = categoryId !== undefined ? eq(products.categoryId, categoryId) : undefined;
  const rows = await client.select({ id: products.id }).from(products).where(where).orderBy(asc(products.sortOrder), asc(products.id));
  return rows.map((row) => row.id);
}

/** Same as `getOrderedProductIds`, but under `SELECT … FOR UPDATE` — held before an arrange save or placement change writes. */
export async function lockOrderedProductIds(tx: DbClient, categoryId?: number): Promise<number[]> {
  const where = categoryId !== undefined ? eq(products.categoryId, categoryId) : undefined;
  const rows = await tx.select({ id: products.id }).from(products).where(where).orderBy(asc(products.sortOrder), asc(products.id)).for("update");
  return rows.map((row) => row.id);
}

/** Every active, featured product id in featured-order — the only products the Featured order concerns. */
export async function getOrderedFeaturedProductIds(client: DbClient): Promise<number[]> {
  const rows = await client
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.isFeatured, true), eq(products.status, "active")))
    .orderBy(asc(products.featuredSortOrder), asc(products.id));
  return rows.map((row) => row.id);
}

/** Same as `getOrderedFeaturedProductIds`, but under `SELECT … FOR UPDATE`. */
export async function lockOrderedFeaturedProductIds(tx: DbClient): Promise<number[]> {
  const rows = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.isFeatured, true), eq(products.status, "active")))
    .orderBy(asc(products.featuredSortOrder), asc(products.id))
    .for("update");
  return rows.map((row) => row.id);
}

/** Totals for the create form's placement fields: every product, and active+featured products. */
export async function getProductCount(): Promise<number> {
  const [row] = await db.select({ count: count() }).from(products);
  return row.count;
}

export async function getFeaturedProductCount(): Promise<number> {
  const [row] = await db.select({ count: count() }).from(products).where(and(eq(products.isFeatured, true), eq(products.status, "active")));
  return row.count;
}

/** Rows for the arrange page: id, name, thumbnail, status, featured — in the order given by `ids`. */
export type ArrangeRow = { id: number; name: string; status: ProductRow["status"]; isFeatured: boolean; categoryId: number };

export async function getProductsByIds(ids: number[]): Promise<Map<number, ArrangeRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: products.id, name: products.name, status: products.status, isFeatured: products.isFeatured, categoryId: products.categoryId })
    .from(products)
    .where(inArray(products.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

/** One `UPDATE … SET sort_order = CASE id WHEN … END` — a single round trip for up to a few hundred rows. */
export async function updateProductSortOrders(tx: DbClient, updates: { id: number; sortOrder: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const caseExpr = sql.join([sql`case id`, ...updates.map((u) => sql`when ${u.id} then ${u.sortOrder}`), sql`else sort_order end`], sql` `);
  await tx
    .update(products)
    .set({ sortOrder: caseExpr })
    .where(
      inArray(
        products.id,
        updates.map((u) => u.id),
      ),
    );
}

export async function updateProductFeaturedSortOrders(tx: DbClient, updates: { id: number; featuredSortOrder: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const caseExpr = sql.join([sql`case id`, ...updates.map((u) => sql`when ${u.id} then ${u.featuredSortOrder}`), sql`else featured_sort_order end`], sql` `);
  await tx
    .update(products)
    .set({ featuredSortOrder: caseExpr })
    .where(
      inArray(
        products.id,
        updates.map((u) => u.id),
      ),
    );
}
