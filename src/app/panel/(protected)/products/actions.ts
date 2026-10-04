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
import { parseFormId } from "@/lib/form-id";
import { requirePermission } from "@/server/auth/permissions";

const NOT_FOUND: StaffActionResult = { ok: false, error: "Product not found." };

export async function createProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_CREATE);
  const result = await createProduct(Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/products");
  return result;
}

export async function updateProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await updateProductById(id, Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/products");
  return result;
}

/** Quick actions (list row menu, and the edit page's own Archive/Restore/Featured controls): never redirect, just report success so the caller can refresh in place. */
export async function archiveProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  return setProductStatus(id, "archived", { id: session.id });
}

export async function restoreProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  return setProductStatus(id, "active", { id: session.id });
}

export async function setFeaturedAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const isFeatured = formData.get("isFeatured") === "true";
  return setProductFeatured(id, isFeatured, { id: session.id });
}

export async function deleteProductAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_DELETE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await deleteProductById(id, { id: session.id });
  if (result.ok) redirect("/panel/products");
  return result;
}
