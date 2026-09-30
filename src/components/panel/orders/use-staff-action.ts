"use client";

import { useActionState, useEffect, useRef } from "react";
import type { StaffActionResult } from "@/features/orders/staff-actions";

type StaffFormAction = (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;

/** Wraps a panel Server Action in `useActionState` and calls `onSuccess` once, right after it succeeds. */
export function useStaffAction(action: StaffFormAction, onSuccess: () => void) {
  const [state, formAction, pending] = useActionState(action, null);
  const handled = useRef(state);

  useEffect(() => {
    if (state !== handled.current && state?.ok) onSuccess();
    handled.current = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return { state, formAction, pending };
}
