"use client";

import { useActionState, useEffect, useRef } from "react";

type ActionResult = { ok: boolean };
type StaffFormAction<T extends ActionResult> = (state: T | null, formData: FormData) => Promise<T>;

/** Wraps a panel Server Action in `useActionState` and calls `onSuccess` once, right after it succeeds. */
export function useStaffAction<T extends ActionResult>(action: StaffFormAction<T>, onSuccess: () => void) {
  const [state, formAction, pending] = useActionState(action, null);
  const handled = useRef(state);

  useEffect(() => {
    if (state !== handled.current && state?.ok) onSuccess();
    handled.current = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return { state, formAction, pending };
}
