"use client";

import { useState } from "react";
import { closeOrderAction, updateFulfilmentAction } from "@/app/panel/(protected)/orders/actions";
import { DIALOG_BODY, DIALOG_FOOTER, Dialog } from "@/components/panel/Dialog";
import { ActionMessage, BUTTON, INPUT, LABEL, TEXTAREA } from "@/components/panel/ui";
import type { OrderControl } from "@/features/orders/staff-service";
import type { CloseAction, StatusAction } from "@/features/orders/transitions";
import { ApproveDialog, DeliveryCheckDialog } from "./ReviewDialogs";
import { useStaffAction } from "./use-staff-action";

type Props = { control: OrderControl; onClose: () => void };

/** Processing → Delivery (courier and tracking note optional), or → Completed; completing a COD order records the cash. */
function FulfilDialog({ control, onClose, status }: Props & { status: "shipped" | "delivered" }) {
  const [state, action, pending] = useStaffAction(updateFulfilmentAction, onClose);
  const shipping = status === "shipped";

  return (
    <Dialog title={shipping ? "Mark as delivery" : "Mark completed"} description={`Order ${control.orderNumber}`} onClose={onClose}>
      <form action={action}>
        <input type="hidden" name="orderNumber" value={control.orderNumber} />
        <input type="hidden" name="status" value={status} />
        <div className={DIALOG_BODY}>
          {shipping ? (
            <>
              <label className="block">
                <span className={LABEL}>
                  Courier <span className="text-muted-foreground font-normal">(optional)</span>
                </span>
                <input name="courier" maxLength={100} className={INPUT} placeholder="e.g. TCS" />
              </label>
              <label className="block">
                <span className={LABEL}>
                  Tracking note <span className="text-muted-foreground font-normal">(optional)</span>
                </span>
                <input name="trackingNote" maxLength={255} className={INPUT} placeholder="e.g. CN 1234567" />
              </label>
            </>
          ) : (
            <p className="text-sm leading-relaxed">
              The order has reached the customer.
              {control.isCod && (
                <>
                  {" "}
                  This records <strong className="font-semibold">{control.total}</strong> as collected in cash.
                </>
              )}
            </p>
          )}
          <p className="text-muted-foreground text-sm">This can&apos;t be undone.</p>
          <ActionMessage state={state} />
        </div>
        <div className={DIALOG_FOOTER}>
          <button type="button" onClick={onClose} className={BUTTON.secondary}>
            Back
          </button>
          <button type="submit" disabled={pending} className={BUTTON.primary}>
            {pending ? "Saving…" : shipping ? "Mark as delivery" : "Mark completed"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const CLOSE_CHOICES: Record<CloseAction, { label: string; button: string }> = {
  cancel: { label: "Cancel order", button: "Cancel order" },
  reject: { label: "Reject order", button: "Reject order" },
};

/**
 * Cancel or reject the whole order (C21), until it is out for delivery, with the reason the
 * customer sees. The stock comes back and a coupon use is released. Never a hard delete.
 */
function CloseDialog({ control, onClose, initial }: Props & { initial: CloseAction }) {
  const [state, action, pending] = useStaffAction(closeOrderAction, onClose);
  const [choice, setChoice] = useState(initial);

  return (
    <Dialog title="Cancel or reject order" description={`Order ${control.orderNumber}`} onClose={onClose}>
      <form action={action}>
        <input type="hidden" name="orderNumber" value={control.orderNumber} />
        <div className={DIALOG_BODY}>
          <fieldset>
            <legend className={LABEL}>What happens to the order?</legend>
            <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
              {(Object.keys(CLOSE_CHOICES) as CloseAction[]).map((key) => (
                <label
                  key={key}
                  className={`flex min-h-10 cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors ${
                    choice === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <input type="radio" name="action" value={key} checked={choice === key} onChange={() => setChoice(key)} className="sr-only" />
                  {CLOSE_CHOICES[key].label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className={LABEL}>Reason</span>
            <textarea name="reason" required maxLength={500} rows={3} className={TEXTAREA} placeholder="e.g. Out of stock" />
            <span className="text-muted-foreground mt-1.5 block text-xs">The customer sees this on their order page.</span>
          </label>
          <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm leading-relaxed">
            The items go back into stock and any coupon use is released. The order and its history are kept.
          </p>
          <ActionMessage state={state} />
        </div>
        <div className={DIALOG_FOOTER}>
          <button type="button" onClick={onClose} className={BUTTON.secondary}>
            Keep order
          </button>
          <button type="submit" disabled={pending} className={BUTTON.danger}>
            {pending ? "Saving…" : CLOSE_CHOICES[choice].button}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The dialog behind each status step (C21); the list's dropdown and trash icon and the detail page's buttons all open these. */
export function ActionDialog({ action, control, onClose }: Props & { action: StatusAction }) {
  switch (action) {
    case "approve":
      return <ApproveDialog control={control} onClose={onClose} />;
    case "check_delivery":
      return <DeliveryCheckDialog control={control} onClose={onClose} />;
    case "ship":
      return <FulfilDialog control={control} onClose={onClose} status="shipped" />;
    case "complete":
      return <FulfilDialog control={control} onClose={onClose} status="delivered" />;
    case "cancel":
    case "reject":
      return <CloseDialog control={control} onClose={onClose} initial={action} />;
  }
}
