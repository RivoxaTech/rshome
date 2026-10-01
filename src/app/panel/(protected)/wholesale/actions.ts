"use server";

import { refresh } from "next/cache";
import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { addWholesaleNote, changeWholesaleStatus, type StaffActionResult } from "@/features/wholesale/staff-actions";
import { requirePermission } from "@/server/auth/permissions";

type StaffChange = (input: unknown, actor: { id: number }) => Promise<StaffActionResult>;

/** The permission first (a refusal redirects to 403), then the service, then fresh page data. */
async function run(permission: PermissionKey, formData: FormData, change: StaffChange): Promise<StaffActionResult> {
  const session = await requirePermission(permission);
  const result = await change(Object.fromEntries(formData), { id: session.id });
  if (result.ok) refresh();
  return result;
}

export async function changeWholesaleStatusAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run(PERMISSIONS.WHOLESALE_MANAGE, formData, changeWholesaleStatus);
}

export async function addWholesaleNoteAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run(PERMISSIONS.WHOLESALE_MANAGE, formData, addWholesaleNote);
}
