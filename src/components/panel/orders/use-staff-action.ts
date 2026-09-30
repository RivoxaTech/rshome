"use client";

import { useActionState } from "react";
import type { StaffActionResult } from "@/features/orders/staff-actions";

type StaffServerAction = (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;

/** A panel Server Action as form state; `onDone` runs once it succeeds (the dialog closes, the page has refreshed). */
export function useStaffAction(action: StaffServerAction, onDone: () => void) {
  return useActionState(async (state: StaffActionResult | null, formData: FormData) => {
    const result = await action(state, formData);
    if (result.ok) onDone();
    return result;
  }, null);
}
