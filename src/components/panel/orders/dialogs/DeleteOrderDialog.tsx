"use client";

import { deleteOrderAction } from "@/app/panel/(protected)/orders/actions";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/orders/use-staff-action";

/** The trash icon on a cancelled or rejected order (owner decision, S9 follow-up): permanent, no reason needed. */
export function DeleteOrderDialog({ orderNumber, onClose }: { orderNumber: string; onClose: () => void }) {
  const { state, formAction, pending } = useStaffAction(deleteOrderAction, onClose);

  return (
    <Dialog open onClose={onClose} title="Delete order">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <p className="text-sm">
          This permanently deletes order <span className="font-medium">{orderNumber}</span> and everything in its history — items,
          screenshots, activity. This cannot be undone.
        </p>
        {state?.ok === false && <p className="text-destructive text-sm">{state.error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="hover:bg-secondary rounded-lg px-3 py-2 text-sm">
            Back
          </button>
          <button
            type="submit"
            disabled={pending}
            className="bg-destructive text-destructive-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete order"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
