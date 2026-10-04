"use client";

import { useState } from "react";
import { closeOrderAction } from "@/app/panel/(protected)/orders/actions";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { CloseAction } from "@/features/orders/transitions";

/**
 * Cancel or reject the whole order (C20): the trash icon opens this with no action chosen yet
 * (a chooser first); the status popover's Cancel/Reject rows open it pre-selected.
 */
export function CloseOrderDialog({
  orderNumber,
  initialAction,
  onClose,
}: {
  orderNumber: string;
  initialAction: CloseAction | null;
  onClose: () => void;
}) {
  const [action, setAction] = useState<CloseAction | null>(initialAction);
  const { state, formAction, pending } = useStaffAction(closeOrderAction, onClose);

  if (!action) {
    return (
      <Dialog open onClose={onClose} title="Cancel or reject order">
        <p className="text-muted-foreground mb-4 text-sm">
          Both restore stock and release any coupon use. The customer sees the reason.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAction("cancel")}
            className="border-border hover:bg-secondary flex-1 rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Cancel order
          </button>
          <button
            type="button"
            onClick={() => setAction("reject")}
            className="border-destructive text-destructive hover:bg-destructive/10 flex-1 rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Reject order
          </button>
        </div>
      </Dialog>
    );
  }

  const title = action === "cancel" ? "Cancel order" : "Reject order";
  return (
    <Dialog open onClose={onClose} title={title}>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <input type="hidden" name="action" value={action} />
        <label className="flex flex-col gap-1 text-sm">
          Reason (the customer sees this)
          <textarea name="reason" rows={3} required className="border-input bg-background rounded-lg border px-3 py-2 text-sm" />
        </label>
        {state?.ok === false && <p role="alert" className="text-destructive text-sm">{state.error}</p>}
        <div className="mt-1 flex justify-between gap-2">
          {!initialAction ? (
            <button type="button" onClick={() => setAction(null)} className="hover:bg-secondary rounded-lg px-3 py-2 text-sm">
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={pending}
            className="bg-destructive text-destructive-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : title}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
