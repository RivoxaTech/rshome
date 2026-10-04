"use server";

import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/features/auth/permissions";
import {
  createCategory,
  deleteCategoryById,
  setCategoryActive,
  updateCategoryById,
  type StaffActionResult,
} from "@/features/catalog/staff-service";
import { parseFormId } from "@/lib/form-id";
import { requirePermission } from "@/server/auth/permissions";

const NOT_FOUND: StaffActionResult = { ok: false, error: "Category not found." };

export async function createCategoryAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.CATEGORY_MANAGE);
  const result = await createCategory(Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/categories");
  return result;
}

export async function updateCategoryAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.CATEGORY_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await updateCategoryById(id, Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/categories");
  return result;
}

/** The delete dialog's "Hide instead" shortcut: one click, no need to open the full edit form. */
export async function hideCategoryAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.CATEGORY_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await setCategoryActive(id, false, { id: session.id });
  if (result.ok) redirect("/panel/categories");
  return result;
}

export async function deleteCategoryAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.CATEGORY_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await deleteCategoryById(id, { id: session.id });
  if (result.ok) redirect("/panel/categories");
  return result;
}
