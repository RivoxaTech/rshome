"use server";

import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/features/auth/permissions";
import {
  createDiscount,
  deleteDiscountById,
  findOverlappingDiscounts,
  setDiscountActive,
  updateDiscountById,
  type DiscountOverlapResult,
  type StaffActionResult,
} from "@/features/discounts/staff-service";
import { parseFormId } from "@/lib/form-id";
import { requirePermission } from "@/server/auth/permissions";

const NOT_FOUND: StaffActionResult = { ok: false, error: "Discount not found." };

export async function createDiscountAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const result = await createDiscount(Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/discounts");
  return result;
}

export async function updateDiscountAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await updateDiscountById(id, Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/discounts");
  return result;
}

/** The list row's / edit page's one-click Activate/Deactivate: never redirects, the caller refreshes in place. */
export async function setDiscountActiveAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const isActive = formData.get("isActive") === "true";
  return setDiscountActive(id, isActive, { id: session.id });
}

export async function deleteDiscountAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await deleteDiscountById(id, { id: session.id });
  if (result.ok) redirect("/panel/discounts");
  return result;
}

/** The form's overlap hint, called directly from the client as the targets change (a read, Zod-checked in the service). */
export async function discountOverlapAction(query: unknown): Promise<DiscountOverlapResult> {
  await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  return findOverlappingDiscounts(query);
}
