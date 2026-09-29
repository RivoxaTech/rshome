import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { categories, productImages, products } from "@/server/db/schema/catalog";

export type CategoryRow = typeof categories.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductImageRow = typeof productImages.$inferSelect;

export function getActiveCategories(): Promise<CategoryRow[]> {
  return db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder));
}

export function getFeaturedActiveProducts(): Promise<ProductRow[]> {
  return db
    .select()
    .from(products)
    .where(and(eq(products.status, "active"), eq(products.isFeatured, true)))
    .orderBy(asc(products.createdAt));
}

/**
 * The primary image per product (DATABASE.md: "Primary image = lowest sort_order"). Fetching
 * every image and reducing in JS keeps this correct without a correlated-subquery join, and is
 * cheap at catalogue sizes in the hundreds (REQUIREMENTS.md: ~200 products at launch).
 */
export async function getPrimaryImagesByProductId(productIds: number[]): Promise<Map<number, ProductImageRow>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sortOrder));

  const primaryByProduct = new Map<number, ProductImageRow>();
  for (const row of rows) {
    if (!primaryByProduct.has(row.productId)) primaryByProduct.set(row.productId, row);
  }
  return primaryByProduct;
}
