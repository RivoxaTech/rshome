/**
 * The panel's products CRUD (S10 phase 2, BUILD_PLAN.md S10): every write locks the row(s) it
 * touches (`SELECT … FOR UPDATE`) and records `audit_logs` rows (CLAUDE.md #10), mirroring
 * `staff-service.ts` (categories, S10 phase 1). A product gets exactly one variant in this phase
 * (full variant CRUD is phase 3): created alongside it, and editable inline only while it's still
 * the product's only variant — a product with several (the 8 seeded samples) shows a read-only
 * summary instead.
 */
import type { ZodError } from "zod";
import { insertAuditLog } from "@/features/audit/repo";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { deleteMediaImage } from "@/server/storage/images";
import { db } from "@/server/db/client";
import { getPrimaryImagesByProductId } from "./repo";
import type { StaffActionResult } from "./staff-service";

export type { StaffActionResult };
import {
  defaultVariantCreateSchema,
  defaultVariantEditSchema,
  productInputSchema,
  type DefaultVariantEditInput,
  type ProductInput,
  type ProductStatus,
  type ProductTab,
} from "./schemas";
import {
  countOrderItemsByProductId,
  deleteProduct,
  deleteProductImagesByProductId,
  deleteVariantsByProductId,
  getActiveCategoryGroups,
  getActiveStockSumsByProductIds,
  getCategoryByIdActive,
  getPrimaryImageByProductId,
  getProductById,
  getProductStatusCounts,
  getVariantsByProductId,
  insertProduct,
  insertProductImage,
  insertVariant,
  listProductsPage,
  lockProductById,
  lockVariantById,
  skuInUse,
  slugInUse,
  updateProduct,
  updateProductImage,
  updateVariant,
  type ProductRow,
  type ProductVariantRow,
} from "./products-staff-repo";

export { getActiveCategoryGroups, getProductStatusCounts };

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

const DUPLICATE_ENTRY = 1062;

async function assertSlugAvailable(slug: string, excludeId?: number): Promise<void> {
  if (await slugInUse(slug, excludeId)) throw new ProductActionError("That slug is already in use. Choose another.");
}

async function assertSkuAvailable(sku: string, excludeId?: number): Promise<void> {
  if (await skuInUse(sku, excludeId)) throw new ProductActionError("That SKU is already in use. Choose another.");
}

/** A category must exist and be active — unless it's the product's own current category, kept on save even if since hidden. */
async function assertCategoryValid(categoryId: number, currentCategoryId?: number): Promise<void> {
  const category = await getCategoryByIdActive(categoryId);
  if (!category) throw new ProductActionError("Choose a valid category.");
  if (!category.isActive && categoryId !== currentCategoryId) throw new ProductActionError("That category is hidden. Choose an active category.");
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
};

export async function listStaffProducts(
  tab: ProductTab,
  query: { q?: string; categoryId?: number; page: number; pageSize: number },
): Promise<{ items: StaffProductListItem[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const offset = (query.page - 1) * query.pageSize;
  const { rows, total } = await listProductsPage({ tab, q: query.q, categoryId: query.categoryId, limit: query.pageSize, offset });
  const ids = rows.map((row) => row.id);
  const [stockSums, images] = await Promise.all([getActiveStockSumsByProductIds(ids), getPrimaryImagesByProductId(ids)]);

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
  }));

  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

// ── The create/edit form ────────────────────────────────────────────────────────────────────

export type ProductEditFormData = {
  product: ProductRow;
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** Set only while this product has exactly one variant — its fields are then editable inline. */
  variant: ProductVariantRow | null;
  /** Set only when it has more than one (the 8 seeded samples) — shown as a read-only summary. */
  multipleVariants: ProductVariantRow[] | null;
};

export async function getProductForEdit(id: number): Promise<ProductEditFormData | null> {
  const product = await getProductById(id);
  if (!product) return null;
  const [variants, images] = await Promise.all([getVariantsByProductId(db, id), getPrimaryImagesByProductId([id])]);
  const image = images.get(id);

  return {
    product,
    imagePath: image?.path ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
    variant: variants.length === 1 ? variants[0] : null,
    multipleVariants: variants.length > 1 ? variants : null,
  };
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────

export async function createProduct(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsedProduct = productInputSchema.safeParse(rawInput);
  if (!parsedProduct.success) return invalid(parsedProduct.error);
  const parsedVariant = defaultVariantCreateSchema.safeParse(rawInput);
  if (!parsedVariant.success) return invalid(parsedVariant.error);
  const input: ProductInput = parsedProduct.data;
  const variantInput = parsedVariant.data;

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
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ProductActionError) return { ok: false, error: error.message, fieldErrors: fieldErrorFor(error.message) };
    if ((error as { errno?: number }).errno === DUPLICATE_ENTRY) {
      return { ok: false, error: "That slug or SKU is already in use. Choose another." };
    }
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────

export async function updateProductById(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsedProduct = productInputSchema.safeParse(rawInput);
  if (!parsedProduct.success) return invalid(parsedProduct.error);
  const input: ProductInput = parsedProduct.data;

  let replacedImagePath: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, id);
      if (!product) throw new ProductActionError("Product not found.");

      await assertSlugAvailable(input.slug, id);
      await assertCategoryValid(input.categoryId, product.categoryId);

      const variants = await getVariantsByProductId(tx, id);
      let variant: ProductVariantRow | null = null;
      let variantInput: DefaultVariantEditInput | null = null;
      if (variants.length === 1) {
        const parsedVariant = defaultVariantEditSchema.safeParse(rawInput);
        if (!parsedVariant.success) throw new ProductActionError(parsedVariant.error.issues[0]?.message ?? "Please check the variant fields.");
        variantInput = parsedVariant.data;
        variant = (await lockVariantById(tx, variants[0].id)) ?? null;
        if (variant) await assertSkuAvailable(variantInput.sku, variant.id);
      }

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

      if (variant && variantInput) {
        await updateVariant(tx, variant.id, { sku: variantInput.sku, stock: variantInput.stock, priceOverride: variantInput.priceOverride, updatedAt: now });
      }

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

      const currentImage = await getPrimaryImageByProductId(tx, id);
      const newPath = input.imagePath;
      if (!currentImage && newPath && input.imagePathWidth && input.imagePathHeight) {
        await insertProductImage(tx, { productId: id, path: newPath, width: input.imagePathWidth, height: input.imagePathHeight, sortOrder: 0, createdAt: now });
      } else if (currentImage && !newPath) {
        await deleteProductImagesByProductId(tx, id);
        replacedImagePath = currentImage.path;
      } else if (currentImage && newPath && currentImage.path !== newPath && input.imagePathWidth && input.imagePathHeight) {
        await updateProductImage(tx, currentImage.id, { path: newPath, width: input.imagePathWidth, height: input.imagePathHeight });
        replacedImagePath = currentImage.path;
      }
    });
  } catch (error) {
    if (error instanceof ProductActionError) return { ok: false, error: error.message, fieldErrors: fieldErrorFor(error.message) };
    if ((error as { errno?: number }).errno === DUPLICATE_ENTRY) {
      return { ok: false, error: "That slug or SKU is already in use. Choose another." };
    }
    throw error;
  }

  // Only removed once the transaction that replaced/cleared it has actually committed.
  if (replacedImagePath) await deleteMediaImage(replacedImagePath);
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
      imagePathsToDelete = await deleteProductImagesByProductId(tx, id);
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
