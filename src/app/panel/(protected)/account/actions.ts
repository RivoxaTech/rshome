"use server";

import { fieldErrorsOf } from "@/features/checkout/schemas";
import { ChangePasswordInputSchema, changePassword } from "@/features/auth/service";
import { requireSession } from "@/server/auth/permissions";

export type ChangePasswordState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> } | undefined;

/** Session only, no permission key (BUILD_PLAN.md C25): any signed-in user may change their own password. */
export async function changePasswordAction(_prevState: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const session = await requireSession();

  const parsed = ChangePasswordInputSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const result = await changePassword(session.id, parsed.data);
  if (!result.ok) {
    return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
  }
  return { ok: true };
}
