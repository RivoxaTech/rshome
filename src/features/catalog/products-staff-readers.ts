/**
 * The panel's product read models (S22 QA-10, split out of `products-staff-service.ts`): the
 * list page, the edit page's form data, the create form's placement totals and the delete guard.
 * Every write stays in `products-staff-service.ts`; variants and images have their own services.
 */
import { decimalToPaisa, paisaToDecimal } from "@/features/pricing/money";
import { isDiscounted } from "@/features/pricing/pricing";
import { getVariantPricer } from "@/features/pricing/service";
import { pageCountOf } from "@/features/shared/pagination";
import { db } from "@/server/db/client";
import { getPanelImages, type PanelImage } from "./images-staff-service";
import {
  countOrderItemsByProductId,
  getActiveCategoryGroups,
  getActiveStockSumsByProductIds,
  getCategoryParentId,
  getFeaturedProductCount,
  getOrderedFeaturedProductIds,
  getOrderedProductIds,
  getProductById,
  getProductCount,
  getProductStatusCounts,
  listProductsPage,
  type ProductRow,
} from "./products-staff-repo";
import { getPrimaryImagesByProductId } from "./repo";
import type { ProductStatus, ProductTab } from "./schemas";
import { getPanelVariants, type PanelVariant } from "./variants-staff-service";

export { getActiveCategoryGroups, getProductStatusCounts };

/** Totals for the create form's placement fields (what "at the end" currently means). */
export async function getPlacementTotals(): Promise<{ shopTotal: number; featuredTotal: number }> {
  const [shopTotal, featuredTotal] = await Promise.all([getProductCount(), getFeaturedProductCount()]);
  return { shopTotal, featuredTotal };
}

// ── Sale price display (read-only; reuses features/pricing, no new pricing logic) ──────────────

export type SaleInfo = { original: string; discounted: string } | null;

/**
 * One discount load (`getVariantPricer`), then `priceVariant` per row in memory — cheap even for a
 * full page of staff rows (features/pricing/service.ts already does this once per request).
 * Computed from `products.price` (no variant override): the list and edit header already show
 * that as *the* price, and variant pricing stays out of scope until phase 3.
 */
async function computeSaleInfo(rows: { id: number; price: string; categoryId: number; parentCategoryId: number | null }[]): Promise<Map<number, SaleInfo>> {
  const pricer = await getVariantPricer();
  const map = new Map<number, SaleInfo>();
  for (const row of rows) {
    const price = pricer({ id: row.id, price: decimalToPaisa(row.price), categoryId: row.categoryId, parentCategoryId: row.parentCategoryId }, null);
    map.set(row.id, isDiscounted(price) ? { original: paisaToDecimal(price.basePrice), discounted: paisaToDecimal(price.unitPrice) } : null);
  }
  return map;
}

// ── The list ────────────────────────────────────────────────────────────────────────────────

export type StaffProductListItem = {
  serial: number;
  id: number;
  name: string;
  slug: string;
  categoryName: string;
  imagePath: string | null;
  price: string;
  stock: number;
  status: ProductStatus;
  isFeatured: boolean;
  salePrice: SaleInfo;
};

export async function listStaffProducts(
  tab: ProductTab,
  query: { q?: string; categoryId?: number; page: number; pageSize: number },
): Promise<{ items: StaffProductListItem[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const offset = (query.page - 1) * query.pageSize;
  const { rows, total } = await listProductsPage({ tab, q: query.q, categoryId: query.categoryId, limit: query.pageSize, offset });
  const ids = rows.map((row) => row.id);
  const [stockSums, images, saleInfo] = await Promise.all([
    getActiveStockSumsByProductIds(ids),
    getPrimaryImagesByProductId(ids),
    computeSaleInfo(rows),
  ]);

  const items: StaffProductListItem[] = rows.map((row, index) => ({
    serial: offset + index + 1,
    id: row.id,
    name: row.name,
    slug: row.slug,
    categoryName: row.categoryName,
    imagePath: images.get(row.id)?.path ?? null,
    price: row.price,
    stock: stockSums.get(row.id) ?? 0,
    status: row.status,
    isFeatured: row.isFeatured,
    salePrice: saleInfo.get(row.id) ?? null,
  }));

  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: pageCountOf(total, query.pageSize) };
}

// ── The edit form ───────────────────────────────────────────────────────────────────────────

type ProductEditFormData = {
  product: ProductRow;
  /** Every variant in display order, for the edit page's variants card (S10). */
  variants: PanelVariant[];
  /** Every image in display order, for the edit page's images card (S10). The product
   *  form itself no longer reads or writes images on edit — only the create form's one field does. */
  images: PanelImage[];
  salePrice: SaleInfo;
  /** 1-based current position in the shop order, and how many products share that order. */
  shopPosition: number;
  shopTotal: number;
  /** Null unless the product is currently featured — its current position in the featured order. */
  featuredPosition: number | null;
  featuredTotal: number;
};

export async function getProductForEdit(id: number): Promise<ProductEditFormData | null> {
  const product = await getProductById(id);
  if (!product) return null;
  const [variants, images, parentCategoryId, shopOrder, featuredOrder] = await Promise.all([
    getPanelVariants(id),
    getPanelImages(id),
    getCategoryParentId(product.categoryId),
    getOrderedProductIds(db),
    getOrderedFeaturedProductIds(db),
  ]);
  const saleInfoMap = await computeSaleInfo([{ id: product.id, price: product.price, categoryId: product.categoryId, parentCategoryId }]);

  return {
    product,
    variants,
    images,
    salePrice: saleInfoMap.get(id) ?? null,
    shopPosition: shopOrder.indexOf(id) + 1,
    shopTotal: shopOrder.length,
    featuredPosition: product.isFeatured ? featuredOrder.indexOf(id) + 1 : null,
    featuredTotal: featuredOrder.length,
  };
}

// ── Delete guard ────────────────────────────────────────────────────────────────────────────

export type ProductDeleteGuard = { allowed: true } | { allowed: false; reason: "has_orders"; count: number };

/** What the delete dialog shows up front; `deleteProductById` refuses regardless under the lock. */
export async function checkProductDeletable(id: number): Promise<ProductDeleteGuard> {
  const orderCount = await countOrderItemsByProductId(id);
  if (orderCount > 0) return { allowed: false, reason: "has_orders", count: orderCount };
  return { allowed: true };
}
