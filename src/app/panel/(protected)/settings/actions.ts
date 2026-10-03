"use server";

import { PERMISSIONS } from "@/features/auth/permissions";
import { notifyListSchema } from "@/features/settings/schemas";
import { saveBankSettings, saveStoreSettings, sendTestEmail, type StaffActionResult, type TestEmailResult } from "@/features/settings/staff-service";
import { requirePermission } from "@/server/auth/permissions";

/** The Admin's bank/contact page (`settings.bank` only — the Developer gets 403 here, C24). Saves in place, never redirects. */
export async function saveBankSettingsAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.SETTINGS_BANK);
  return saveBankSettings(Object.fromEntries(formData), { id: session.id, name: session.name });
}

/** The Developer's store page (`settings.manage` only — the Admin gets 403 here, C24). */
export async function saveStoreSettingsAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  return saveStoreSettings(Object.fromEntries(formData), { id: session.id, name: session.name });
}

/** "Send test email" for one recipient list (`list` = order | wholesale), to the list as last saved. */
export async function sendTestEmailAction(_prevState: TestEmailResult | null, formData: FormData): Promise<TestEmailResult> {
  const session = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const list = notifyListSchema.safeParse(formData.get("list"));
  if (!list.success) return { ok: false, error: "Choose which recipient list to test." };
  return sendTestEmail(list.data, { id: session.id, name: session.name });
}
