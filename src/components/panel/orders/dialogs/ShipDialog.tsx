"use client";

import { updateFulfilmentAction } from "@/app/panel/(protected)/orders/actions";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";

/** Processing → Delivery: courier and tracking note are both optional. */
export function ShipDialog({ orderNumber, onClose }: { orderNumber: string; onClose: () => void }) {
  const { state, formAction, pending } = useStaffAction(updateFulfilmentAction, onClose);

  return (
    <Dialog open onClose={onClose} title="Move to Delivery">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <input type="hidden" name="status" value="shipped" />
        <label className="flex flex-col gap-1 text-sm">
          Courier (optional)
          <input name="courier" maxLength={100} className="border-input bg-background rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tracking note (optional)
          <input name="trackingNote" maxLength={255} className="border-input bg-background rounded-lg border px-3 py-2 text-sm" />
        </label>
        {state?.ok === false && <p role="alert" className="text-destructive text-sm">{state.error}</p>}
        <div className="mt-1 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "Move to Delivery"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
