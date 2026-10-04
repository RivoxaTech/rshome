"use server";

import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/features/auth/permissions";
import { createRole, deleteRoleById, resetRoleToDefaults, saveRolePermissions, updateRoleById, type StaffActionResult } from "@/features/roles/staff-service";
import { parseFormId } from "@/lib/form-id";
import { requirePermission } from "@/server/auth/permissions";
import { getCurrentSessionId } from "@/server/auth/session";

/** Every action here needs `role.manage`; whoever holds it may change any key on any role (S20 owner decision). */

const NOT_FOUND: StaffActionResult = { ok: false, error: "Role not found." };

async function actor() {
  const session = await requirePermission(PERMISSIONS.ROLE_MANAGE);
  return { id: session.id, sessionId: await getCurrentSessionId() };
}

export async function createRoleAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const result = await createRole(Object.fromEntries(formData), await actor());
  if (result.ok) redirect("/panel/roles");
  return result;
}

export async function updateRoleAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const who = await actor();
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await updateRoleById(id, Object.fromEntries(formData), who);
  if (result.ok) redirect("/panel/roles");
  return result;
}

/** The matrix's per-column Save: saves in place, never redirects — the page refreshes and hands down new version tokens. */
export async function saveRolePermissionsAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const who = await actor();
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  return saveRolePermissions(id, Object.fromEntries(formData), who);
}

/** "Reset to defaults" on a system role: saves in place, the caller refreshes. */
export async function resetRoleDefaultsAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const who = await actor();
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  return resetRoleToDefaults(id, Object.fromEntries(formData), who);
}

export async function deleteRoleAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const who = await actor();
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await deleteRoleById(id, who);
  if (result.ok) redirect("/panel/roles");
  return result;
}
