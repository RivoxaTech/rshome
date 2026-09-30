"use client";

import { useState } from "react";
import { approveOrderAction, reviewProofAction } from "@/app/panel/(protected)/orders/actions";
import { DIALOG_BODY, DIALOG_FOOTER, Dialog } from "@/components/panel/Dialog";
import { ActionMessage, BUTTON, INPUT, LABEL, TEXTAREA } from "@/components/panel/ui";
import type { OrderControl, ProofView } from "@/features/orders/staff-service";
import { ProofImage } from "./ProofImage";
import { useStaffAction } from "./use-staff-action";

type Props = { control: OrderControl; onClose: () => void };

/** Reject a screenshot with the reason the customer sees on their order page; they can upload again. */
function RejectProofForm({ proof, onBack, onDone }: { proof: ProofView; onBack: () => void; onDone: () => void }) {
  const [state, action, pending] = useStaffAction(reviewProofAction, onDone);
  return (
    <form action={action}>
      <input type="hidden" name="proofId" value={proof.id} />
      <input type="hidden" name="decision" value="reject" />
      <div className={DIALOG_BODY}>
        <label className="block">
          <span className={LABEL}>Why isn&apos;t the screenshot accepted?</span>
          <textarea name="reason" required maxLength={500} rows={3} autoFocus className={TEXTAREA} placeholder="e.g. The amount doesn't match" />
          <span className="text-muted-foreground mt-1.5 block text-xs">The customer sees this and can upload a new screenshot.</span>
        </label>
        <ActionMessage state={state} />
      </div>
      <div className={DIALOG_FOOTER}>
        <button type="button" onClick={onBack} className={BUTTON.secondary}>
          Back
        </button>
        <button type="submit" disabled={pending} className={BUTTON.danger}>
          {pending ? "Rejecting…" : "Reject screenshot"}
        </button>
      </div>
    </form>
  );
}

function ScreenshotCaption({ proof, amount }: { proof: ProofView; amount: string | null }) {
  return (
    <p className="text-muted-foreground text-sm">
      {amount && (
        <>
          Should show <strong className="text-foreground font-semibold">{amount}</strong> ·{" "}
        </>
      )}
      uploaded {proof.uploadedAt}
    </p>
  );
}

/**
 * Need review → approve (C21): the delivery charge in whole rupees (0 allowed) and an optional
 * note; for bank transfer the products screenshot too, which can be rejected instead. Approve
 * stays disabled until a charge is typed. One tap sets the charge, approves the screenshot and
 * moves the order on (`approveOrder`).
 */
export function ApproveDialog({ control, onClose }: Props) {
  const [state, action, pending] = useStaffAction(approveOrderAction, onClose);
  const [amount, setAmount] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const proof = control.isCod ? null : control.goodsProof;
  const canReject = proof?.status === "submitted" && control.canRejectProof;
  const entered = /^\d[\d,]*$/.test(amount.trim());

  const hint = control.isCod
    ? `The customer pays ${control.goodsTotal} plus the delivery charge in cash on delivery. The order moves to Processing.`
    : control.deliveryChargeByTransfer
      ? "The customer then transfers the delivery charge and uploads its screenshot (Pending delivery charge). With 0 the order moves straight to Processing."
      : "The customer pays the delivery charge in cash on delivery. The order moves to Processing.";

  return (
    <Dialog title={rejecting ? "Reject payment screenshot" : "Approve order"} description={`Order ${control.orderNumber}`} onClose={onClose}>
      {rejecting && proof ? (
        <RejectProofForm proof={proof} onBack={() => setRejecting(false)} onDone={onClose} />
      ) : (
        <form action={action}>
          <input type="hidden" name="orderNumber" value={control.orderNumber} />
          <div className={DIALOG_BODY}>
            {proof && (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Products payment screenshot</p>
                <ProofImage proofId={proof.id} alt="Products payment screenshot" />
                <ScreenshotCaption proof={proof} amount={control.goodsTotal} />
              </div>
            )}
            <label className="block">
              <span className={LABEL}>Delivery charge (PKR)</span>
              <input
                name="amount"
                required
                inputMode="numeric"
                autoComplete="off"
                maxLength={9}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={INPUT}
                placeholder="e.g. 450, or 0 if free"
              />
            </label>
            <label className="block">
              <span className={LABEL}>
                Note <span className="text-muted-foreground font-normal">(optional)</span>
              </span>
              <input name="note" maxLength={255} className={INPUT} placeholder="e.g. 2 cartons, TCS" />
            </label>
            <p className="text-muted-foreground text-sm leading-relaxed">{hint}</p>
            <ActionMessage state={state} />
          </div>
          <div className={`${DIALOG_FOOTER} ${canReject ? "sm:justify-between" : ""}`}>
            {canReject && (
              <button type="button" onClick={() => setRejecting(true)} className={BUTTON.dangerOutline}>
                Reject screenshot
              </button>
            )}
            <button type="submit" disabled={!entered || pending} className={BUTTON.primary}>
              {pending ? "Approving…" : "Approve order"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/**
 * Pending delivery charge with a screenshot in (C21): approve it (the order moves to Processing)
 * or reject it with a reason.
 */
export function DeliveryCheckDialog({ control, onClose }: Props) {
  const [state, action, pending] = useStaffAction(reviewProofAction, onClose);
  const [rejecting, setRejecting] = useState(false);
  const proof = control.deliveryProof;
  if (!proof) return null;

  return (
    <Dialog title={rejecting ? "Reject delivery charge screenshot" : "Check delivery charge"} description={`Order ${control.orderNumber}`} onClose={onClose}>
      {rejecting ? (
        <RejectProofForm proof={proof} onBack={() => setRejecting(false)} onDone={onClose} />
      ) : (
        <form action={action}>
          <input type="hidden" name="proofId" value={proof.id} />
          <input type="hidden" name="decision" value="approve" />
          <div className={DIALOG_BODY}>
            <ProofImage proofId={proof.id} alt="Delivery charge payment screenshot" />
            <ScreenshotCaption proof={proof} amount={control.deliveryCharge} />
            <p className="text-muted-foreground text-sm">Approving moves the order to Processing.</p>
            <ActionMessage state={state} />
          </div>
          <div className={`${DIALOG_FOOTER} sm:justify-between`}>
            <button type="button" onClick={() => setRejecting(true)} className={BUTTON.dangerOutline}>
              Reject
            </button>
            <button type="submit" disabled={pending} className={BUTTON.primary}>
              {pending ? "Approving…" : "Approve delivery charge"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
