"use server";

import { z } from "zod";
import { PERMISSIONS } from "@/features/auth/permissions";
import { imageAltSchema, moveToPlacementSchema, productImageSchema, saveImageOrderSchema, saveVariantOrderSchema, variantStockSchema } from "@/features/catalog/schemas";
import {
  addProductImage,
  deleteProductImage,
  moveImage,
  saveImageOrder,
  setImageAlt,
} from "@/features/catalog/images-staff-service";
import {
  createVariant,
  deleteVariantById,
  moveVariant,
  saveVariantOrder,
  setVariantActive,
  setVariantStock,
  updateVariantById,
  type StaffActionResult,
} from "@/features/catalog/variants-staff-service";
import { requirePermission } from "@/server/auth/permissions";

/**
 * The edit page's variants card (S10). Every action is a `product.update` write — a
 * variant is part of its product, so there's no separate permission key — and none redirects: the
 * card refreshes in place (`router.refresh()`), the panel's quick-action convention.
 */

const idSchema = z.coerce.number().int().positive();

const BAD_ID: StaffActionResult = { ok: false, error: "Please reload and try again." };

export async function createVariantAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const productId = idSchema.safeParse(formData.get("productId"));
  if (!productId.success) return BAD_ID;
  return createVariant(productId.data, Object.fromEntries(formData), { id: session.id });
}

export async function updateVariantAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const variantId = idSchema.safeParse(formData.get("variantId"));
  if (!variantId.success) return BAD_ID;
  return updateVariantById(variantId.data, Object.fromEntries(formData), { id: session.id });
}

/** The list row's inline "adjust stock" control. */
export async function setVariantStockAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const variantId = idSchema.safeParse(formData.get("variantId"));
  if (!variantId.success) return BAD_ID;
  const parsed = variantStockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid stock.", fieldErrors: { stock: parsed.error.issues[0]?.message ?? "Enter a valid stock." } };
  return setVariantStock(variantId.data, parsed.data.stock, { id: session.id });
}

export async function setVariantActiveAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const variantId = idSchema.safeParse(formData.get("variantId"));
  if (!variantId.success) return BAD_ID;
  return setVariantActive(variantId.data, formData.get("isActive") === "true", { id: session.id });
}

export async function deleteVariantAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const variantId = idSchema.safeParse(formData.get("variantId"));
  if (!variantId.success) return BAD_ID;
  return deleteVariantById(variantId.data, { id: session.id });
}

/** The per-row "Move to top/end/position N" quick action — a tiny `<form>`, same shape as the arrange page's. */
export async function moveVariantAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const variantId = idSchema.safeParse(formData.get("variantId"));
  if (!variantId.success) return BAD_ID;
  const parsed = moveToPlacementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the position." };
  const placement = parsed.data.placement === "position" ? ({ type: "position", position: parsed.data.position! } as const) : ({ type: parsed.data.placement } as const);
  return moveVariant({ variantId: variantId.data, placement }, { id: session.id });
}

/** The full drag-drop result — called directly from the client (the payload is an id array, not form fields), so this is the one boundary check it gets. */
export async function saveVariantOrderAction(input: unknown): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const parsed = saveVariantOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please reload and try again." };
  return saveVariantOrder(parsed.data, { id: session.id });
}

// ── Images card (S10) ──────────────────────────────────────────────────────────────

/** Adds one already-uploaded file (the uploader calls this once per file, right after `/api/panel/uploads` returns) — called directly from the client, not a `<form>`. */
export async function addProductImageAction(productId: number, input: unknown): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const parsedId = idSchema.safeParse(productId);
  if (!parsedId.success) return BAD_ID;
  const parsed = productImageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That upload didn't work. Try again." };
  return addProductImage(parsedId.data, parsed.data, { id: session.id });
}

/** The per-image alt-text field: saved on blur or a small Save button, like the variant row's stock control. */
export async function setImageAltAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const imageId = idSchema.safeParse(formData.get("imageId"));
  if (!imageId.success) return BAD_ID;
  const parsed = imageAltSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Keep this under 255 characters.", fieldErrors: { alt: parsed.error.issues[0]?.message ?? "Keep this under 255 characters." } };
  return setImageAlt(imageId.data, parsed.data, { id: session.id });
}

export async function deleteProductImageAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const imageId = idSchema.safeParse(formData.get("imageId"));
  if (!imageId.success) return BAD_ID;
  return deleteProductImage(imageId.data, { id: session.id });
}

/** The per-row "Move to top/end/position N" quick action — the same tiny `<form>` shape as the variants card's. */
export async function moveImageAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const imageId = idSchema.safeParse(formData.get("imageId"));
  if (!imageId.success) return BAD_ID;
  const parsed = moveToPlacementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the position." };
  const placement = parsed.data.placement === "position" ? ({ type: "position", position: parsed.data.position! } as const) : ({ type: parsed.data.placement } as const);
  return moveImage({ imageId: imageId.data, placement }, { id: session.id });
}

/** "Make primary": the same move as placement "top", one click, no listbox. */
export async function makeImagePrimaryAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const imageId = idSchema.safeParse(formData.get("imageId"));
  if (!imageId.success) return BAD_ID;
  return moveImage({ imageId: imageId.data, placement: { type: "top" } }, { id: session.id });
}

/** The full drag-drop result — called directly from the client, same shape as the variants card's. */
export async function saveImageOrderAction(input: unknown): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const parsed = saveImageOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please reload and try again." };
  return saveImageOrder(parsed.data, { id: session.id });
}
