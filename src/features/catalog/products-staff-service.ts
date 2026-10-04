/**
 * The panel's products writes (S10, BUILD_PLAN.md S10): every write locks the row(s) it
 * touches (`SELECT … FOR UPDATE`) and records `audit_logs` rows (CLAUDE.md #10), mirroring
 * `staff-service.ts` (categories, S10). A new product gets one "Default" variant (SKU +
 * stock) in the same transaction; everything else about variants is `variants-staff-service.ts`
 * (phase 3a), surfaced on the edit page as its own card outside the product form. The read models
 * (list, edit form, totals, delete guard) are `products-staff-readers.ts` (S22 QA-10).
 */
import { insertAuditLog } from "@/features/audit/repo";
import { StaffActionError, invalidInput } from "@/features/shared/staff-result";
import { isDuplicateEntry } from "@/server/db/errors";
import { db } from "@/server/db/client";
import { deleteMediaImage } from "@/server/storage/images";
import { applyFeaturedPlacement, applyShopPlacement, toPlacement } from "./arrange-service";
import { deleteImagesByProductId, insertProductImage } from "./images-staff-repo";
import {
  countOrderItemsByProductId,
  deleteProduct,
  getCategoryByIdActive,
  insertProduct,
  lockProductById,
  slugInUse,
  updateProduct,
  type ProductRow,
} from "./products-staff-repo";
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
  type ShopPlacementEditInput,
  type ShopPlacementInput,
} from "./schemas";
import type { StaffActionResult } from "./staff-service";
import { deleteVariantsByProductId, insertVariant, skuInUse } from "./variants-staff-repo";

export type { StaffActionResult };

type Actor = { id: number };

/** Maps a known refusal message to the field it's about, so the form highlights the right input. */
function fieldErrorFor(message: string): Record<string, string> | undefined {
  if (message.includes("slug")) return { slug: message };
  if (message.includes("SKU")) return { sku: message };
  if (message.toLowerCase().includes("categor")) return { categoryId: message };
  return undefined;
}

async function assertSlugAvailable(slug: string, excludeId?: number): Promise<void> {
  if (await slugInUse(slug, excludeId)) throw new StaffActionError("That slug is already in use. Choose another.");
}

/** Only the create form posts a SKU (its "Default" variant); every later SKU change goes through the variants card. */
async function assertSkuAvailable(sku: string): Promise<void> {
  if (await skuInUse(sku)) throw new StaffActionError("That SKU is already in use. Choose another.");
}

/** A category must exist and be active — unless it's the product's own current category, kept on save even if since hidden. */
async function assertCategoryValid(categoryId: number, currentCategoryId?: number): Promise<void> {
  const category = await getCategoryByIdActive(categoryId);
  if (!category) throw new StaffActionError("Choose a valid category.");
  if (!category.isActive && categoryId !== currentCategoryId) throw new StaffActionError("That category is hidden. Choose an active category.");
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

// ── Create ──────────────────────────────────────────────────────────────────────────────────

export async function createProduct(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsedProduct = productInputSchema.safeParse(rawInput);
  if (!parsedProduct.success) return invalidInput(parsedProduct.error);
  const parsedVariant = defaultVariantCreateSchema.safeParse(rawInput);
  if (!parsedVariant.success) return invalidInput(parsedVariant.error);
  const parsedShopPlacement = shopPlacementCreateSchema.safeParse(rawInput);
  if (!parsedShopPlacement.success) return invalidInput(parsedShopPlacement.error);
  const parsedFeaturedPlacement = featuredPlacementCreateSchema.safeParse(rawInput);
  if (!parsedFeaturedPlacement.success) return invalidInput(parsedFeaturedPlacement.error);
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
    if (error instanceof StaffActionError) return { ok: false, error: error.message, fieldErrors: fieldErrorFor(error.message) };
    if (isDuplicateEntry(error)) {
      return { ok: false, error: "That slug or SKU is already in use. Choose another." };
    }
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────

export async function updateProductById(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsedProduct = productInputSchema.safeParse(rawInput);
  if (!parsedProduct.success) return invalidInput(parsedProduct.error);
  const parsedShopPlacement = shopPlacementEditSchema.safeParse(rawInput);
  if (!parsedShopPlacement.success) return invalidInput(parsedShopPlacement.error);
  const parsedFeaturedPlacement = featuredPlacementEditSchema.safeParse(rawInput);
  if (!parsedFeaturedPlacement.success) return invalidInput(parsedFeaturedPlacement.error);
  const input: ProductInput = parsedProduct.data;
  const shopPlacement: ShopPlacementEditInput = parsedShopPlacement.data;
  const featuredPlacement: FeaturedPlacementEditInput = parsedFeaturedPlacement.data;

  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, id);
      if (!product) throw new StaffActionError("Product not found.");

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
    if (error instanceof StaffActionError) return { ok: false, error: error.message, fieldErrors: fieldErrorFor(error.message) };
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
      if (!product) throw new StaffActionError("Product not found.");
      if (product.status === status) throw new StaffActionError(`This product is already ${status}.`);

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
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function setProductFeatured(id: number, isFeatured: boolean, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, id);
      if (!product) throw new StaffActionError("Product not found.");
      if (product.isFeatured === isFeatured) throw new StaffActionError(`This product is already ${isFeatured ? "featured" : "not featured"}.`);

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
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────

export async function deleteProductById(id: number, actor: Actor): Promise<StaffActionResult> {
  let imagePathsToDelete: string[] = [];
  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, id);
      if (!product) throw new StaffActionError("Product not found.");

      const orderCount = await countOrderItemsByProductId(id);
      if (orderCount > 0) {
        throw new StaffActionError(`${orderCount} ${orderCount === 1 ? "order uses" : "orders use"} this product, so it can't be deleted. Archive it instead.`);
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
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }

  for (const path of imagePathsToDelete) await deleteMediaImage(path);
  return { ok: true };
}
