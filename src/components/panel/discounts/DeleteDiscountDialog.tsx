"use client";

import { useActionState, useState } from "react";
import { Dialog } from "@/components/panel/Dialog";
import type { StaffActionResult } from "@/features/discounts/staff-service";
import { deleteDiscountAction } from "@/app/panel/(protected)/discounts/actions";

/**
 * The edit page's Delete button. Always allowed: order items snapshot their price and discount at
 * purchase, so no past order points at a discount row — the dialog says so.
 */
export function DeleteDiscountDialog({ id, name }: { id: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteDiscountAction, null as StaffActionResult | null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-destructive hover:bg-destructive/10 rounded-md px-3 py-2 text-sm font-medium">
        Delete
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete “${name}”`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            This can&apos;t be undone. Past orders are unaffected: every order item keeps the price and discount it was bought at, so nothing is
            recalculated.
          </p>
          {state && !state.ok && <p role="alert" className="text-destructive text-sm">{state.error}</p>}
          <form action={formAction} className="flex justify-end gap-2">
            <input type="hidden" name="id" value={id} />
            <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              {pending ? "Deleting…" : "Delete"}
            </button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
