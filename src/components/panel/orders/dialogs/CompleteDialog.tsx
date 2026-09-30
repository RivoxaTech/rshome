"use client";

import { updateFulfilmentAction } from "@/app/panel/(protected)/orders/actions";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/orders/use-staff-action";

/** Delivery → Completed; for cash on delivery this also records the cash as collected. */
export function CompleteDialog({ orderNumber, isCod, onClose }: { orderNumber: string; isCod: boolean; onClose: () => void }) {
  const { state, formAction, pending } = useStaffAction(updateFulfilmentAction, onClose);

  return (
    <Dialog open onClose={onClose} title="Mark completed">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <input type="hidden" name="status" value="delivered" />
        <p className="text-sm">
          Mark this order as delivered to the customer.
          {isCod && " This records the cash as collected."}
        </p>
        {state?.ok === false && <p className="text-destructive text-sm">{state.error}</p>}
        <div className="mt-1 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "Mark completed"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
