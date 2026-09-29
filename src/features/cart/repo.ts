import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { categories, products, productVariants } from "@/server/db/schema/catalog";

/** A cart line's variant with the product columns the quote needs, whatever its status. */
export async function getCartVariantRows(variantIds: number[]) {
  if (variantIds.length === 0) return [];
  return db
    .select({
      id: productVariants.id,
      label: productVariants.label,
      attributes: productVariants.attributes,
      priceOverride: productVariants.priceOverride,
      stock: productVariants.stock,
      isActive: productVariants.isActive,
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      productStatus: products.status,
      productPrice: products.price,
      categoryId: products.categoryId,
      parentCategoryId: categories.parentId,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(inArray(productVariants.id, variantIds));
}

export type CartVariantRow = Awaited<ReturnType<typeof getCartVariantRows>>[number];
