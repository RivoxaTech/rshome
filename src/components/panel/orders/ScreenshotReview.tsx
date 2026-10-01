"use client";

import { useState } from "react";
import { reviewProofAction } from "@/app/panel/(protected)/orders/actions";
import { ProofImage } from "@/components/panel/orders/ProofImage";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { OrderControl } from "@/features/orders/staff-service";

/** One waiting screenshot with its Approve/Reject controls; used in the modal and inline on the detail page. */
export function ScreenshotReview({ item, onDone }: { item: OrderControl["toCheck"][number]; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const approve = useStaffAction(reviewProofAction, onDone);
  const reject = useStaffAction(reviewProofAction, onDone);

  return (
    <div className="border-border flex flex-col gap-3 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        <ProofImage proofId={item.id} label={`${item.purposeLabel} screenshot`} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">{item.purposeLabel} screenshot</p>
          {item.amount && <p className="text-muted-foreground">Amount to check: {item.amount}</p>}
          {item.effect && <p className="text-muted-foreground mt-1 text-xs">{item.effect}</p>}
        </div>
      </div>

      {rejecting ? (
        <form action={reject.formAction} className="flex flex-col gap-2">
          <input type="hidden" name="proofId" value={item.id} />
          <input type="hidden" name="decision" value="reject" />
          <p className="text-muted-foreground text-xs">This rejects the whole order. The customer sees it as Rejected with your reason.</p>
          <textarea
            name="reason"
            rows={2}
            required
            placeholder="Reason (the customer sees this)"
            className="border-input bg-background rounded-lg border px-3 py-2 text-sm"
          />
          {reject.state?.ok === false && <p className="text-destructive text-sm">{reject.state.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRejecting(false)} className="hover:bg-secondary rounded-lg px-3 py-1.5 text-sm">
              Back
            </button>
            <button
              type="submit"
              disabled={reject.pending}
              className="bg-destructive text-destructive-foreground rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {reject.pending ? "Rejecting order…" : "Reject order"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setRejecting(true)} className="text-destructive text-sm hover:underline">
            Reject order
          </button>
          <form action={approve.formAction}>
            <input type="hidden" name="proofId" value={item.id} />
            <input type="hidden" name="decision" value="approve" />
            {approve.state?.ok === false && <p className="text-destructive text-sm">{approve.state.error}</p>}
            <button
              type="submit"
              disabled={approve.pending}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {approve.pending ? "Approving…" : "Approve"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
