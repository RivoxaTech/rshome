/**
 * The panel's products CRUD (S10, BUILD_PLAN.md S10): every write locks the row(s) it
 * touches (`SELECT … FOR UPDATE`) and records `audit_logs` rows (CLAUDE.md #10), mirroring
 * `staff-service.ts` (categories, S10). A new product gets one "Default" variant (SKU +
 * stock) in the same transaction; everything else about variants is `variants-staff-service.ts`
 * (phase 3a), surfaced on the edit page as its own card outside the product form.
 */
import type { ZodError } from "zod";
import { insertAuditLog } from "@/features/audit/repo";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { decimalToPaisa, paisaToDecimal } from "@/features/pricing/money";
import { isDiscounted } from "@/features/pricing/pricing";
import { getVariantPricer } from "@/features/pricing/service";
import { deleteMediaImage } from "@/server/storage/images";
import { db, type DbClient } from "@/server/db/client";
import { getPrimaryImagesByProductId } from "./repo";
import { deleteImagesByProductId, insertProductImage } from "./images-staff-repo";
import { getPanelImages, type PanelImage } from "./images-staff-service";
import { moveId, renormalize, type Placement } from "./ordering";
import type { StaffActionResult } from "./staff-service";

export type { StaffActionResult };
import {
  defaultVariantCreateSchema,
  featuredPlacementCreateSchema,
  featuredPlacementEditSchema,
  productInputSchema,
  shopPlacementCreateSchema,
  shopPlacementEditSchema,
  type FeaturedPlacementEditInput,
  type FeaturedPlacementInput,
  type ProductInput,
  type ProductStatus,
  type ProductTab,
  type ShopPlacementEditInput,
  type ShopPlacementInput,
} from "./schemas";
import {
  countOrderItemsByProductId,
  deleteProduct,
  getActiveCategoryGroups,
  getActiveStockSumsByProductIds,
  getCategoryByIdActive,
  getCategoryParentId,
  getFeaturedProductCount,
  getOrderedFeaturedProductIds,
  getOrderedProductIds,
  getProductCount,
  getProductById,
  getProductStatusCounts,
  insertProduct,
  listProductsPage,
  lockOrderedFeaturedProductIds,
  lockOrderedProductIds,
  lockProductById,
  slugInUse,
  updateProduct,
  updateProductFeaturedSortOrders,
  updateProductSortOrders,
  type ProductRow,
} from "./products-staff-repo";
import { deleteVariantsByProductId, insertVariant, skuInUse } from "./variants-staff-repo";
import { getPanelVariants, type PanelVariant } from "./variants-staff-service";
import { isDuplicateEntry } from "@/server/db/errors";

export { getActiveCategoryGroups, getProductStatusCounts };

/** Totals for the create form's placement fields (what "at the end" currently means). */
export async function getPlacementTotals(): Promise<{ shopTotal: number; featuredTotal: number }> {
  const [shopTotal, featuredTotal] = await Promise.all([getProductCount(), getFeaturedProductCount()]);
  return { shopTotal, featuredTotal };
}

type Actor = { id: number };

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
class ProductActionError extends Error {}

function invalid(error: ZodError): StaffActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

/** Maps a known refusal message to the field it's about, so the form highlights the right input. */
function fieldErrorFor(message: string): Record<string, string> | undefined {
  if (message.includes("slug")) return { slug: message };
  if (message.includes("SKU")) return { sku: message };
  if (message.toLowerCase().includes("categor")) return { categoryId: message };
  return undefined;
}

async function assertSlugAvailable(slug: string, excludeId?: number): Promise<void> {
  if (await slugInUse(slug, excludeId)) throw new ProductActionError("That slug is already in use. Choose another.");
}

/** Only the create form posts a SKU (its "Default" variant); every later SKU change goes through the variants card. */
async function assertSkuAvailable(sku: string): Promise<void> {
  if (await skuInUse(sku)) throw new ProductActionError("That SKU is already in use. Choose another.");
}

/** A category must exist and be active — unless it's the product's own current category, kept on save even if since hidden. */
async function assertCategoryValid(categoryId: number, currentCategoryId?: number): Promise<void> {
  const category = await getCategoryByIdActive(categoryId);
  if (!category) throw new ProductActionError("Choose a valid category.");
  if (!category.isActive && categoryId !== currentCategoryId) throw new ProductActionError("That category is hidden. Choose an active category.");
}

// ── Manual ordering (S10) ──────────────────────────────────────────────────────────────

/** `"keep"` (edit only) means "don't touch this order" — the caller skips applying anything. */
function toPlacement(placement: "top" | "end" | "position" | "keep", position?: number): Placement | null {
  if (placement === "keep") return null;
  if (placement === "position") return { type: "position", position: position! };
  return { type: placement };
}

/**
 * Moves (or, for a brand-new id not yet in the list, inserts) `productId` within the shop order
 * and writes every row whose `sort_order` changed, inside `tx`. `moveId` removing-then-reinserting
 * an id that isn't present yet is exactly an insert, so this one function covers both create and
 * edit. One audit row records the whole before/after order (ARCHITECTURE.md D51).
 */
async function applyShopPlacement(tx: DbClient, productId: number, placement: Placement, actor: Actor, now: Date): Promise<void> {
  const existing = await lockOrderedProductIds(tx);
  const next = moveId(existing, productId, placement);
  const positions = renormalize(next);
  await updateProductSortOrders(tx, [...positions.entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
  await insertAuditLog(tx, {
    userId: actor.id,
    action: "product.sort_change",
    entity: "product_order",
    entityId: "shop",
    oldValues: { order: existing },
    newValues: { order: next },
    createdAt: now,
  });
}

/** Same as `applyShopPlacement`, for the featured order (scoped to active, featured products only). */
async function applyFeaturedPlacement(tx: DbClient, productId: number, placement: Placement, actor: Actor, now: Date): Promise<void> {
  const existing = await lockOrderedFeaturedProductIds(tx);
  const next = moveId(existing, productId, placement);
  const positions = renormalize(next);
  await updateProductFeaturedSortOrders(tx, [...positions.entries()].map(([id, featuredSortOrder]) => ({ id, featuredSortOrder })));
  await insertAuditLog(tx, {
    userId: actor.id,
    action: "product.sort_change",
    entity: "product_order",
    entityId: "featured",
    oldValues: { order: existing },
    newValues: { order: next },
    createdAt: now,
  });
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

type ProductAuditFields = Pick<ProductRow, "name" | "slug" | "categoryId" | "shortDescription" | "description" | "price" | "weightGrams" | "isFeatured" | "status">;

function productAuditValues(product: ProductAuditFields) {
  return {
    name: product.name,
    slug: product.slug,
    categoryId: product.categoryId,
    shortDescription: product.shortDescription,
    description: product.description,
    price: product.price,
    weightGrams: product.weightGrams,
    isFeatured: product.isFeatured,
    status: product.status,
  };
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

  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

// ── The create/edit form ────────────────────────────────────────────────────────────────────

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

// ── Create ──────────────────────────────────────────────────────────────────────────────────

export async function createProduct(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsedProduct = productInputSchema.safeParse(rawInput);
  if (!parsedProduct.success) return invalid(parsedProduct.error);
  const parsedVariant = defaultVariantCreateSchema.safeParse(rawInput);
  if (!parsedVariant.success) return invalid(parsedVariant.error);
  const parsedShopPlacement = shopPlacementCreateSchema.safeParse(rawInput);
  if (!parsedShopPlacement.success) return invalid(parsedShopPlacement.error);
  const parsedFeaturedPlacement = featuredPlacementCreateSchema.safeParse(rawInput);
  if (!parsedFeaturedPlacement.success) return invalid(parsedFeaturedPlacement.error);
  const input: ProductInput = parsedProduct.data;
  const variantInput = parsedVariant.data;
  const shopPlacement: ShopPlacementInput = parsedShopPlacement.data;
  const featuredPlacement: FeaturedPlacementInput = parsedFeaturedPlacement.data;

  try {
    const id = await db.transaction(async (tx) => {
      await assertSlugAvailable(input.slug);
      await assertSkuAvailable(variantInput.sku);
      await assertCategoryValid(input.categoryId);

      const now = new Date();
      const id = await insertProduct(tx, {
        categoryId: input.categoryId,
        name: input.name,
        slug: input.slug,
        shortDescription: input.shortDescription,
        description: input.description,
        price: input.price,
        weightGrams: input.weightGrams,
        isFeatured: input.isFeatured,
        status: input.status,
        createdAt: now,
        updatedAt: now,
      });
      await insertVariant(tx, {
        productId: id,
        sku: variantInput.sku,
        label: "Default",
        attributes: "{}",
        stock: variantInput.stock,
        sortOrder: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      if (input.imagePath && input.imagePathWidth && input.imagePathHeight) {
        await insertProductImage(tx, { productId: id, path: input.imagePath, width: input.imagePathWidth, height: input.imagePathHeight, sortOrder: 0, createdAt: now });
      }
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.create",
        entity: "product",
        entityId: id,
        oldValues: null,
        newValues: { ...productAuditValues(input), sku: variantInput.sku, stock: variantInput.stock },
        createdAt: now,
      });

      const shopPlacementValue = toPlacement(shopPlacement.shopPlacement, shopPlacement.shopPosition);
      if (shopPlacementValue) await applyShopPlacement(tx, id, shopPlacementValue, actor, now);
      if (input.isFeatured) {
        const featuredPlacementValue = toPlacement(featuredPlacement.featuredPlacement, featuredPlacement.featuredPosition);
        if (featuredPlacementValue) await applyFeaturedPlacement(tx, id, featuredPlacementValue, actor, now);
      }

      return id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ProductActionError) return { ok: false, error: error.message, fieldErrors: fieldErrorFor(error.message) };
    if (isDuplicateEntry(error)) {
      return { ok: false, error: "That slug or SKU is already in use. Choose another." };
    }
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────

export async function updateProductById(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsedProduct = productInputSchema.safeParse(rawInput);
  if (!parsedProduct.success) return invalid(parsedProduct.error);
  const parsedShopPlacement = shopPlacementEditSchema.safeParse(rawInput);
  if (!parsedShopPlacement.success) return invalid(parsedShopPlacement.error);
  const parsedFeaturedPlacement = featuredPlacementEditSchema.safeParse(rawInput);
  if (!parsedFeaturedPlacement.success) return invalid(parsedFeaturedPlacement.error);
  const input: ProductInput = parsedProduct.data;
  const shopPlacement: ShopPlacementEditInput = parsedShopPlacement.data;
  const featuredPlacement: FeaturedPlacementEditInput = parsedFeaturedPlacement.data;

  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, id);
      if (!product) throw new ProductActionError("Product not found.");

      await assertSlugAvailable(input.slug, id);
      await assertCategoryValid(input.categoryId, product.categoryId);

      const now = new Date();
      await updateProduct(tx, id, {
        categoryId: input.categoryId,
        name: input.name,
        slug: input.slug,
        shortDescription: input.shortDescription,
        description: input.description,
        price: input.price,
        weightGrams: input.weightGrams,
        isFeatured: input.isFeatured,
        status: input.status,
        updatedAt: now,
      });

      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.update",
        entity: "product",
        entityId: id,
        oldValues: productAuditValues(product),
        newValues: productAuditValues(input),
        createdAt: now,
      });
      if (input.price !== product.price) {
        await insertAuditLog(tx, {
          userId: actor.id,
          action: "product.price_change",
          entity: "product",
          entityId: id,
          oldValues: { price: product.price },
          newValues: { price: input.price },
          createdAt: now,
        });
      }
      if (input.status !== product.status) {
        await insertAuditLog(tx, {
          userId: actor.id,
          action: "product.status_change",
          entity: "product",
          entityId: id,
          oldValues: { status: product.status },
          newValues: { status: input.status },
          createdAt: now,
        });
      }
      if (input.isFeatured !== product.isFeatured) {
        await insertAuditLog(tx, {
          userId: actor.id,
          action: "product.featured_change",
          entity: "product",
          entityId: id,
          oldValues: { isFeatured: product.isFeatured },
          newValues: { isFeatured: input.isFeatured },
          createdAt: now,
        });
      }

      const shopPlacementValue = toPlacement(shopPlacement.shopPlacement, shopPlacement.shopPosition);
      if (shopPlacementValue) await applyShopPlacement(tx, id, shopPlacementValue, actor, now);
      if (input.isFeatured) {
        // A product newly turned Featured has no "current position" to keep — default to the end.
        const becameFeatured = !product.isFeatured;
        const effective = becameFeatured && featuredPlacement.featuredPlacement === "keep" ? "end" : featuredPlacement.featuredPlacement;
        const featuredPlacementValue = toPlacement(effective, featuredPlacement.featuredPosition);
        if (featuredPlacementValue) await applyFeaturedPlacement(tx, id, featuredPlacementValue, actor, now);
      }
    });
  } catch (error) {
    if (error instanceof ProductActionError) return { ok: false, error: error.message, fieldErrors: fieldErrorFor(error.message) };
    if (isDuplicateEntry(error)) {
      return { ok: false, error: "That slug is already in use. Choose another.", fieldErrors: { slug: "That slug is already in use. Choose another." } };
    }
    throw error;
  }

  return { ok: true, id };
}

// ── Quick actions: status and featured ─────────────────────────────────────────────────────

export async function setProductStatus(id: number, status: ProductStatus, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, id);
      if (!product) throw new ProductActionError("Product not found.");
      if (product.status === status) throw new ProductActionError(`This product is already ${status}.`);

      const now = new Date();
      await updateProduct(tx, id, { status, updatedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.status_change",
        entity: "product",
        entityId: id,
        oldValues: { status: product.status },
        newValues: { status },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ProductActionError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function setProductFeatured(id: number, isFeatured: boolean, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, id);
      if (!product) throw new ProductActionError("Product not found.");
      if (product.isFeatured === isFeatured) throw new ProductActionError(`This product is already ${isFeatured ? "featured" : "not featured"}.`);

      const now = new Date();
      await updateProduct(tx, id, { isFeatured, updatedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.featured_change",
        entity: "product",
        entityId: id,
        oldValues: { isFeatured: product.isFeatured },
        newValues: { isFeatured },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ProductActionError) return { ok: false, error: error.message };
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────

export type ProductDeleteGuard = { allowed: true } | { allowed: false; reason: "has_orders"; count: number };

export async function checkProductDeletable(id: number): Promise<ProductDeleteGuard> {
  const orderCount = await countOrderItemsByProductId(id);
  if (orderCount > 0) return { allowed: false, reason: "has_orders", count: orderCount };
  return { allowed: true };
}

export async function deleteProductById(id: number, actor: Actor): Promise<StaffActionResult> {
  let imagePathsToDelete: string[] = [];
  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, id);
      if (!product) throw new ProductActionError("Product not found.");

      const orderCount = await countOrderItemsByProductId(id);
      if (orderCount > 0) {
        throw new ProductActionError(`${orderCount} ${orderCount === 1 ? "order uses" : "orders use"} this product, so it can't be deleted. Archive it instead.`);
      }

      const now = new Date();
      await deleteVariantsByProductId(tx, id);
      imagePathsToDelete = await deleteImagesByProductId(tx, id);
      await deleteProduct(tx, id);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.delete",
        entity: "product",
        entityId: id,
        oldValues: productAuditValues(product),
        newValues: {},
        createdAt: now,
      });
    });
  } catch (error) {
    if (error instanceof ProductActionError) return { ok: false, error: error.message };
    throw error;
  }

  for (const path of imagePathsToDelete) await deleteMediaImage(path);
  return { ok: true };
}
