"use server";

import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/features/auth/permissions";
import { createUser, deleteUserById, resetUserPassword, setUserActive, updateUserById, type StaffActionResult } from "@/features/users/staff-service";
import { parseFormId } from "@/lib/form-id";
import { requirePermission } from "@/server/auth/permissions";

/** Every action here needs `user.manage` (Developer-only, C24): the Admin, or a session holding only another key, is sent to 403; no session goes to login. */

const NOT_FOUND: StaffActionResult = { ok: false, error: "User not found." };

export async function createUserAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  // Never redirects: the form shows the temporary password once, then offers the way back.
  return createUser(Object.fromEntries(formData), { id: session.id });
}

export async function updateUserAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await updateUserById(id, Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/users");
  return result;
}

/** The list row's / edit page's one-click Activate/Deactivate: never redirects, the caller refreshes in place. */
export async function setUserActiveAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const isActive = formData.get("isActive") === "true";
  return setUserActive(id, isActive, { id: session.id });
}

/** The edit page's reset dialog: the new password is posted once, hashed, and never comes back. */
export async function resetUserPasswordAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  return resetUserPassword(id, { password: formData.get("password") }, { id: session.id });
}

export async function deleteUserAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await deleteUserById(id, { id: session.id });
  if (result.ok) redirect("/panel/users");
  return result;
}
