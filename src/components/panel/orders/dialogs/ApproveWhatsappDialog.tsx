"use client";

import { approveDeliveryWhatsappAction } from "@/app/panel/(protected)/orders/actions";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";

/**
 * "Approve order (paid via WhatsApp)" (D63): for a bank order waiting on its delivery-charge
 * screenshot, when the customer sent it straight to the shop's WhatsApp instead of uploading it
 * here. No file to review — just a staff confirmation, recorded and audited like any other review.
 */
export function ApproveWhatsappDialog({ orderNumber, onClose }: { orderNumber: string; onClose: () => void }) {
  const { state, formAction, pending } = useStaffAction(approveDeliveryWhatsappAction, onClose);

  return (
    <Dialog open onClose={onClose} title="Approve order (paid via WhatsApp)">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <p className="text-sm">
          Confirms that the customer sent the delivery-charge payment screenshot on WhatsApp instead of uploading it here. This moves order{" "}
          <span className="font-medium">{orderNumber}</span> to Processing, the same as approving an uploaded screenshot.
        </p>
        {state?.ok === false && <p role="alert" className="text-destructive text-sm">{state.error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="hover:bg-secondary rounded-lg px-3 py-2 text-sm">
            Back
          </button>
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Approving…" : "Approve order"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
