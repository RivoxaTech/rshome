"use server";

import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/features/auth/permissions";
import { createCoupon, deleteCouponById, setCouponActive, updateCouponById, type StaffActionResult } from "@/features/coupons/staff-service";
import { requirePermission } from "@/server/auth/permissions";

export async function createCouponAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.COUPON_MANAGE);
  const result = await createCoupon(Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/coupons");
  return result;
}

export async function updateCouponAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.COUPON_MANAGE);
  const id = Number(formData.get("id"));
  const result = await updateCouponById(id, Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/coupons");
  return result;
}

/** The list row's / edit page's / delete dialog's one-click Activate/Deactivate: never redirects, the caller refreshes in place. */
export async function setCouponActiveAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.COUPON_MANAGE);
  const id = Number(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  return setCouponActive(id, isActive, { id: session.id });
}

export async function deleteCouponAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.COUPON_MANAGE);
  const id = Number(formData.get("id"));
  const result = await deleteCouponById(id, { id: session.id });
  if (result.ok) redirect("/panel/coupons");
  return result;
}
