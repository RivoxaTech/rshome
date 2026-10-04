/**
 * The panel's product-images CRUD (S10, REQUIREMENTS DV-02, ARCHITECTURE.md D54). Every
 * write runs in one transaction that locks the product row and then the product's whole image set
 * (`SELECT … FOR UPDATE`, the same product-then-children lock order `variants-staff-service.ts`
 * takes), re-checks the rules under that lock, and writes `audit_logs` rows (CLAUDE.md #10).
 * Refusals come back as `{ ok: false }`, never thrown.
 *
 * The rules: at most `MAX_PRODUCT_IMAGES` per product; a path can belong to only one row (and must
 * match the exact shape the upload route produces — checked again here since it's later used to
 * delete files on disk); a reorder is checked against a fresh locked read (stale or foreign ids
 * refused); positions stay dense after a delete. A failed add after upload deletes the uploaded
 * file so nothing is orphaned; a deleted row's files are removed only after the transaction commits.
 */
import type { ZodError } from "zod";
import { insertAuditLog } from "@/features/audit/repo";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { deleteMediaImage } from "@/server/storage/images";
import { db, type DbClient } from "@/server/db/client";
import {
  deleteProductImageRow,
  getImageProductId,
  getImagesByProductId,
  imagePathInUse,
  insertProductImage,
  lockImagesByProductId,
  updateImageSortOrders,
  updateProductImage,
  type ProductImageRow,
} from "./images-staff-repo";
import { moveId, renormalize, type Placement } from "./ordering";
import { lockProductById } from "./products-staff-repo";
import { MAX_PRODUCT_IMAGES, imageAltSchema, productImageSchema, type ImageAltInput, type ProductImageInput } from "./schemas";
import type { StaffActionResult } from "./staff-service";

export type { StaffActionResult };

type Actor = { id: number };

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
class ImageActionError extends Error {}

function invalid(error: ZodError): StaffActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

function refusal(error: unknown): StaffActionResult {
  if (error instanceof ImageActionError) return { ok: false, error: error.message };
  throw error;
}

const MAX_IMAGES_MESSAGE = `A product can have at most ${MAX_PRODUCT_IMAGES} images.`;

// ── The read model ──────────────────────────────────────────────────────────────────────────

export type PanelImage = { id: number; path: string; width: number; height: number; alt: string | null; position: number };

function toPanelImage(row: ProductImageRow, index: number): PanelImage {
  return { id: row.id, path: row.path, width: row.width, height: row.height, alt: row.alt, position: index + 1 };
}

export async function getPanelImages(productId: number): Promise<PanelImage[]> {
  const rows = await getImagesByProductId(db, productId);
  return rows.map(toPanelImage);
}

/** Locks the product, then its images, and resolves the one being acted on — refusing a stale id instead of silently doing nothing. */
async function lockImageContext(tx: DbClient, productId: number, imageId: number): Promise<{ images: ProductImageRow[]; image: ProductImageRow }> {
  const product = await lockProductById(tx, productId);
  if (!product) throw new ImageActionError("Product not found.");
  const images = await lockImagesByProductId(tx, productId);
  const image = images.find((row) => row.id === imageId);
  if (!image) throw new ImageActionError("That image no longer exists. Reload and try again.");
  return { images, image };
}

function imageAudit(actor: Actor, imageId: number, action: string, oldValues: object | null, newValues: object, now: Date) {
  return { userId: actor.id, action, entity: "product_image", entityId: imageId, oldValues, newValues, createdAt: now };
}

// ── Add (one already-uploaded file at a time) ───────────────────────────────────────────────

/**
 * Adds one file `/api/panel/uploads` already wrote to disk to a product's gallery. On any refusal
 * the file would otherwise be orphaned (its DB row never existed), so it's deleted here before
 * returning — the uploader never has to know the on-disk path to clean it up itself.
 */
const ALREADY_ADDED_MESSAGE = "That image was already added.";

export async function addProductImage(productId: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = productImageSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input: ProductImageInput = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      const product = await lockProductById(tx, productId);
      if (!product) throw new ImageActionError("Product not found.");
      const siblings = await lockImagesByProductId(tx, productId);
      if (siblings.length >= MAX_PRODUCT_IMAGES) throw new ImageActionError(MAX_IMAGES_MESSAGE);
      if (await imagePathInUse(input.path)) throw new ImageActionError(ALREADY_ADDED_MESSAGE);

      const now = new Date();
      const id = await insertProductImage(tx, {
        productId,
        path: input.path,
        width: input.width,
        height: input.height,
        alt: null,
        // Appended after the current last position (positions are renormalized on every reorder).
        sortOrder: siblings.length === 0 ? 0 : Math.max(...siblings.map((row) => row.sortOrder)) + 1,
        createdAt: now,
      });
      await insertAuditLog(tx, imageAudit(actor, id, "product.image_add", null, { productId, path: input.path, width: input.width, height: input.height }, now));
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    // "Already added" means the files belong to an existing row, so they stay (S22 BUG-26).
    if (!(error instanceof ImageActionError && error.message === ALREADY_ADDED_MESSAGE)) await deleteMediaImage(input.path);
    return refusal(error);
  }
}

// ── Alt text ────────────────────────────────────────────────────────────────────────────────

export async function setImageAlt(imageId: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = imageAltSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input: ImageAltInput = parsed.data;

  try {
    const productId = await getImageProductId(imageId);
    if (productId === undefined) throw new ImageActionError("That image no longer exists. Reload and try again.");

    await db.transaction(async (tx) => {
      const { image } = await lockImageContext(tx, productId, imageId);
      if (image.alt === input.alt) return;
      const now = new Date();
      await updateProductImage(tx, imageId, { alt: input.alt });
      await insertAuditLog(tx, imageAudit(actor, imageId, "product.image_alt_change", { alt: image.alt }, { alt: input.alt }, now));
    });
    return { ok: true, id: imageId };
  } catch (error) {
    return refusal(error);
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────

export async function deleteProductImage(imageId: number, actor: Actor): Promise<StaffActionResult> {
  let pathToDelete: string | null = null;
  try {
    const productId = await getImageProductId(imageId);
    if (productId === undefined) throw new ImageActionError("That image no longer exists. Reload and try again.");

    await db.transaction(async (tx) => {
      const { images, image } = await lockImageContext(tx, productId, imageId);
      const now = new Date();
      await deleteProductImageRow(tx, imageId);
      // Keep the remaining positions dense (1..n), so "position" means the same thing after a delete.
      const remaining = images.filter((row) => row.id !== imageId).map((row) => row.id);
      await updateImageSortOrders(tx, [...renormalize(remaining).entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
      await insertAuditLog(tx, imageAudit(actor, imageId, "product.image_delete", { productId, path: image.path, width: image.width, height: image.height, alt: image.alt }, {}, now));
      pathToDelete = image.path;
    });
  } catch (error) {
    return refusal(error);
  }

  // Only removed once the transaction that deleted the row has actually committed.
  if (pathToDelete) await deleteMediaImage(pathToDelete);
  return { ok: true };
}

// ── Reorder (drag-drop save, per-row move, and the "Make primary" shortcut) ────────────────

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id)) && new Set(b).size === set.size;
}

async function writeImageOrder(tx: DbClient, productId: number, before: number[], after: number[], actor: Actor): Promise<void> {
  const now = new Date();
  await updateImageSortOrders(tx, [...renormalize(after).entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
  await insertAuditLog(tx, {
    userId: actor.id,
    action: "product.image_sort_change",
    entity: "product_image_order",
    entityId: productId,
    oldValues: { order: before },
    newValues: { order: after },
    createdAt: now,
  });
}

/** The whole drag-drop result: `orderedIds` must be exactly the product's current image ids, just reordered (checked against a fresh locked read). */
export async function saveImageOrder(input: { productId: number; orderedIds: number[] }, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, input.productId);
      if (!product) throw new ImageActionError("Product not found.");
      const existing = (await lockImagesByProductId(tx, input.productId)).map((row) => row.id);
      if (!sameIdSet(existing, input.orderedIds)) throw new ImageActionError("This list changed elsewhere. Reload and try again.");
      await writeImageOrder(tx, input.productId, existing, input.orderedIds, actor);
    });
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

/** A per-row "Move to top/end/position N" within the image's own product; "Make primary" is this with `{ type: "top" }`. */
export async function moveImage(input: { imageId: number; placement: Placement }, actor: Actor): Promise<StaffActionResult> {
  try {
    const productId = await getImageProductId(input.imageId);
    if (productId === undefined) throw new ImageActionError("That image no longer exists. Reload and try again.");

    await db.transaction(async (tx) => {
      const { images } = await lockImageContext(tx, productId, input.imageId);
      const existing = images.map((row) => row.id);
      await writeImageOrder(tx, productId, existing, moveId(existing, input.imageId, input.placement), actor);
    });
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}
