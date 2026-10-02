import { and, asc, eq, inArray, like, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { categories, productImages, products, productVariants } from "@/server/db/schema/catalog";

export type CategoryRow = typeof categories.$inferSelect;
export type ProductImageRow = typeof productImages.$inferSelect;
export type VariantRow = typeof productVariants.$inferSelect;

/**
 * Every category, active or not (a handful of rows): `features/catalog/service.ts` computes which
 * ones are actually visible (a hidden parent hides its children too, S10 phase 1), so the whole
 * table is needed here rather than a `WHERE is_active` filter.
 */
export function listAllCategories(): Promise<CategoryRow[]> {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id));
}

// What a product card and the discount lookup need; no long description (TEXT) in lists.
const listingColumns = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  shortDescription: products.shortDescription,
  price: products.price,
  categoryId: products.categoryId,
  parentCategoryId: categories.parentId,
  createdAt: products.createdAt,
};

function selectActiveListingProducts(...conditions: SQL[]) {
  return db
    .select(listingColumns)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.status, "active"), ...conditions));
}

export type ListingProductRow = Awaited<ReturnType<typeof selectActiveListingProducts>>[number];

export function getFeaturedActiveProducts(): Promise<ListingProductRow[]> {
  return selectActiveListingProducts(eq(products.isFeatured, true)).orderBy(asc(products.createdAt));
}

/** MySQL's LIKE escape character is a backslash; escape it and the two wildcards. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Every active product matching the filter, unsorted and unpaginated: the caller sorts by the
 * discounted price (computed in features/pricing, not SQL) and then slices a page. Uses the
 * (category_id, status) / (status, created_at) indexes; see ARCHITECTURE.md D27.
 */
export function getActiveListingProducts(filter: {
  categoryIds: number[] | null;
  nameQuery: string | null;
}): Promise<ListingProductRow[]> {
  const conditions: SQL[] = [];
  if (filter.categoryIds) conditions.push(inArray(products.categoryId, filter.categoryIds));
  if (filter.nameQuery) conditions.push(like(products.name, `%${escapeLike(filter.nameQuery)}%`));
  return selectActiveListingProducts(...conditions);
}

export async function getActiveProductBySlug(slug: string) {
  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      shortDescription: products.shortDescription,
      description: products.description,
      price: products.price,
      categoryId: products.categoryId,
      parentCategoryId: categories.parentId,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.status, "active")))
    .limit(1);
  return row;
}

/** Active variants in display order, for one or many products (index: product_id, sort_order). */
export function getActiveVariantsByProductIds(productIds: number[]): Promise<VariantRow[]> {
  if (productIds.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(productVariants)
    .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true)))
    .orderBy(asc(productVariants.productId), asc(productVariants.sortOrder), asc(productVariants.id));
}

export function getProductImages(productId: number): Promise<ProductImageRow[]> {
  return db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder), asc(productImages.id));
}

/**
 * The primary image per product (DATABASE.md: "Primary image = lowest sort_order"). Fetching
 * every image and reducing in JS keeps this correct without a correlated-subquery join, and is
 * cheap here: callers pass one page of products at most.
 */
export async function getPrimaryImagesByProductId(productIds: number[]): Promise<Map<number, ProductImageRow>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sortOrder), asc(productImages.id));

  const primaryByProduct = new Map<number, ProductImageRow>();
  for (const row of rows) {
    if (!primaryByProduct.has(row.productId)) primaryByProduct.set(row.productId, row);
  }
  return primaryByProduct;
}
