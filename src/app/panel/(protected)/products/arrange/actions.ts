"use server";

import { z } from "zod";
import { PERMISSIONS } from "@/features/auth/permissions";
import { moveToPlacementSchema, saveFeaturedOrderSchema, saveShopOrderSchema } from "@/features/catalog/schemas";
import { moveFeaturedProduct, moveShopProduct, saveFeaturedOrder, saveShopOrder, type StaffActionResult } from "@/features/catalog/arrange-service";
import { requirePermission } from "@/server/auth/permissions";

const productIdSchema = z.coerce.number().int().positive();

/** The full drag-drop result for one scope — called directly from the client, not through a `<form>` (the payload is an id array, not form fields), so this is the one boundary check it gets. */
export async function saveShopOrderAction(input: unknown): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const parsed = saveShopOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please reload and try again." };
  return saveShopOrder(parsed.data, { id: session.id });
}

export async function saveFeaturedOrderAction(input: unknown): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const parsed = saveFeaturedOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please reload and try again." };
  return saveFeaturedOrder(parsed.data, { id: session.id });
}

/** The per-row "Move to top/end/position N" quick action — a tiny `<form>`, the usual quick-action shape. */
export async function moveShopProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const parsedProductId = productIdSchema.safeParse(formData.get("productId"));
  if (!parsedProductId.success) return { ok: false, error: "Please reload and try again." };
  const categoryIdRaw = formData.get("categoryId");
  const parsedCategoryId = categoryIdRaw ? productIdSchema.safeParse(categoryIdRaw) : undefined;
  if (parsedCategoryId && !parsedCategoryId.success) return { ok: false, error: "Please reload and try again." };
  const parsed = moveToPlacementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the position." };
  const placement = parsed.data.placement === "position" ? ({ type: "position", position: parsed.data.position! } as const) : ({ type: parsed.data.placement } as const);
  return moveShopProduct({ productId: parsedProductId.data, categoryId: parsedCategoryId?.data, placement }, { id: session.id });
}

export async function moveFeaturedProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const parsedProductId = productIdSchema.safeParse(formData.get("productId"));
  if (!parsedProductId.success) return { ok: false, error: "Please reload and try again." };
  const parsed = moveToPlacementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the position." };
  const placement = parsed.data.placement === "position" ? ({ type: "position", position: parsed.data.position! } as const) : ({ type: parsed.data.placement } as const);
  return moveFeaturedProduct({ productId: parsedProductId.data, placement }, { id: session.id });
}
