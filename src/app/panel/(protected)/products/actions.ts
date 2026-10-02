"use server";

import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/features/auth/permissions";
import {
  createProduct,
  deleteProductById,
  setProductFeatured,
  setProductStatus,
  updateProductById,
  type StaffActionResult,
} from "@/features/catalog/products-staff-service";
import { requirePermission } from "@/server/auth/permissions";

export async function createProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_CREATE);
  const result = await createProduct(Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/products");
  return result;
}

export async function updateProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const id = Number(formData.get("id"));
  const result = await updateProductById(id, Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/products");
  return result;
}

/** Quick actions (list row menu, and the edit page's own Archive/Restore/Featured controls): never redirect, just report success so the caller can refresh in place. */
export async function archiveProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const id = Number(formData.get("id"));
  return setProductStatus(id, "archived", { id: session.id });
}

export async function restoreProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const id = Number(formData.get("id"));
  return setProductStatus(id, "active", { id: session.id });
}

export async function setFeaturedAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const id = Number(formData.get("id"));
  const isFeatured = formData.get("isFeatured") === "true";
  return setProductFeatured(id, isFeatured, { id: session.id });
}

export async function deleteProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_DELETE);
  const id = Number(formData.get("id"));
  const result = await deleteProductById(id, { id: session.id });
  if (result.ok) redirect("/panel/products");
  return result;
}
