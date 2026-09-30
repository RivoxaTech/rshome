"use client";

import { useState } from "react";
import { approveOrderAction, reviewProofAction } from "@/app/panel/(protected)/orders/actions";
import { Dialog } from "@/components/panel/Dialog";
import { ProofImage } from "@/components/panel/orders/ProofImage";
import { useStaffAction } from "@/components/panel/orders/use-staff-action";
import type { ProofView } from "@/features/orders/staff-service";

/**
 * "Approve order" (C20/C22): the delivery charge and note, plus the products screenshot for a
 * bank order with a fallback to reject the whole order instead (owner decision, S9: rejecting the
 * screenshot rejects the order).
 */
export function ApproveDialog({
  orderNumber,
  isCod,
  goodsProof,
  goodsTotal,
  startInReject = false,
  onClose,
}: {
  orderNumber: string;
  isCod: boolean;
  goodsProof: ProofView | null;
  goodsTotal: string;
  startInReject?: boolean;
  onClose: () => void;
}) {
  const [rejecting, setRejecting] = useState(startInReject);
  const approve = useStaffAction(approveOrderAction, onClose);
  const reject = useStaffAction(reviewProofAction, onClose);

  if (rejecting && goodsProof) {
    return (
      <Dialog open onClose={onClose} title="Reject order">
        <form action={reject.formAction} className="flex flex-col gap-3">
          <input type="hidden" name="proofId" value={goodsProof.id} />
          <input type="hidden" name="decision" value="reject" />
          <p className="text-muted-foreground text-sm">This rejects the whole order. The customer sees it as Rejected with your reason, and stock is restored.</p>
          <label className="flex flex-col gap-1 text-sm">
            Reason (the customer sees this)
            <textarea name="reason" rows={3} required className="border-input bg-background rounded-lg border px-3 py-2 text-sm" />
          </label>
          {reject.state?.ok === false && <p className="text-destructive text-sm">{reject.state.error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => setRejecting(false)} className="hover:bg-secondary rounded-lg px-3 py-2 text-sm">
              Back
            </button>
            <button
              type="submit"
              disabled={reject.pending}
              className="bg-destructive text-destructive-foreground rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {reject.pending ? "Rejecting order…" : "Reject order"}
            </button>
          </div>
        </form>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="Approve order">
      {!isCod && goodsProof && (
        <div className="mb-4 flex items-center gap-3">
          <ProofImage proofId={goodsProof.id} label="Products payment screenshot" />
          <p className="text-muted-foreground text-sm">Products total: {goodsTotal}</p>
        </div>
      )}
      <form action={approve.formAction} className="flex flex-col gap-3">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <label className="flex flex-col gap-1 text-sm">
          Delivery charge (PKR, whole rupees — 0 is allowed)
          <input
            name="amount"
            inputMode="numeric"
            placeholder="e.g. 450"
            required
            className="border-input bg-background rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Note (optional — courier, parcel count…)
          <input name="note" maxLength={255} className="border-input bg-background rounded-lg border px-3 py-2 text-sm" />
        </label>
        {approve.state?.ok === false && <p className="text-destructive text-sm">{approve.state.error}</p>}
        <div className="mt-1 flex items-center justify-between gap-2">
          {!isCod && goodsProof ? (
            <button type="button" onClick={() => setRejecting(true)} className="text-destructive text-sm hover:underline">
              Reject order instead
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={approve.pending}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {approve.pending ? "Approving…" : "Approve order"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
