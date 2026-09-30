"use client";

import { useActionState } from "react";
import { addOrderNoteAction } from "@/app/panel/(protected)/orders/actions";
import { ActionMessage, BUTTON, TEXTAREA } from "@/components/panel/ui";

/** A staff-only note in the order's activity; the customer never sees it. React clears the form once it is sent. */
export function OrderNoteForm({ orderNumber }: { orderNumber: string }) {
  const [state, action, pending] = useActionState(addOrderNoteAction, null);

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <label className="sr-only" htmlFor="order-note">
        Internal note
      </label>
      <textarea id="order-note" name="note" required maxLength={2000} rows={2} className={TEXTAREA} placeholder="Add an internal note (only staff see it)" />
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={BUTTON.secondary}>
          {pending ? "Adding…" : "Add note"}
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
