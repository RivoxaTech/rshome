"use client";

import { useState, type ReactNode } from "react";
import { PanelIcon } from "@/components/panel/icons";
import { BUTTON } from "@/components/panel/ui";
import type { OrderControl, StaffOrderView } from "@/features/orders/staff-service";
import { ProofImage } from "./ProofImage";
import { ApproveDialog, ApproveProofButton, ScreenshotCheckDialog } from "./ReviewDialogs";
import { WhatsAppLink } from "./WhatsAppLink";

const CARD = "bg-card border-border rounded-lg border shadow-xs";

function ScreenshotCard({ title, proofId, alt, children }: { title: string; proofId: number; alt: string; children: ReactNode }) {
  return (
    <section className={`${CARD} grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]`}>
      <h2 className="text-sm sm:hidden">{title}</h2>
      <ProofImage proofId={proofId} alt={alt} className="max-h-[50dvh] sm:max-h-[26rem]" />
      <div className="grid content-start gap-3">
        <h2 className="text-sm max-sm:hidden">{title}</h2>
        {children}
      </div>
    </section>
  );
}

/**
 * The detail page's payment card, near the top (C22). In Need review, the products screenshot
 * large with Approve order (the charge dialog) and Reject screenshot. Past Need review, the
 * screenshot waiting to be checked (products first) with Approve and Reject. When the order waits
 * for the customer, what it waits for and the WhatsApp button.
 */
export function PaymentCard({
  control,
  reviewingGoods,
  wait,
  whatsApp,
}: {
  control: OrderControl;
  reviewingGoods: boolean;
  wait: StaffOrderView["customerWait"];
  whatsApp: StaffOrderView["whatsApp"];
}) {
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const close = () => setDialog(null);
  const waiting = control.toCheck[0];

  if (reviewingGoods && control.goodsProof) {
    const canApprove = control.actions.some(({ action }) => action === "approve");
    return (
      <ScreenshotCard title="Products payment screenshot" proofId={control.goodsProof.id} alt="Products payment screenshot">
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Should show <strong className="text-foreground font-semibold">{control.goodsTotal}</strong>
          <br />
          Uploaded {control.goodsProof.uploadedAt}
        </p>
        <p className="text-muted-foreground text-[13px] leading-relaxed">Approve with the delivery charge, or reject it and the customer uploads a new one.</p>
        <div className="grid gap-2">
          {canApprove && (
            <button type="button" onClick={() => setDialog("approve")} className={BUTTON.primary}>
              Approve order
            </button>
          )}
          {control.canReviewProofs && (
            <button type="button" onClick={() => setDialog("reject")} className={BUTTON.dangerOutline}>
              Reject screenshot
            </button>
          )}
        </div>
        {dialog && <ApproveDialog control={control} onClose={close} showProof={false} startRejecting={dialog === "reject"} />}
      </ScreenshotCard>
    );
  }

  if (waiting) {
    return (
      <ScreenshotCard title={`${waiting.purposeLabel} screenshot to check`} proofId={waiting.id} alt={`${waiting.purposeLabel} payment screenshot`}>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          {waiting.amount && (
            <>
              Should show <strong className="text-foreground font-semibold">{waiting.amount}</strong>
              <br />
            </>
          )}
          Uploaded {waiting.uploadedAt}
        </p>
        {waiting.effect && <p className="text-muted-foreground text-[13px] leading-relaxed">{waiting.effect}</p>}
        {control.canReviewProofs && (
          <div className="grid gap-2">
            <ApproveProofButton proof={waiting} />
            <button type="button" onClick={() => setDialog("reject")} className={BUTTON.dangerOutline}>
              Reject screenshot
            </button>
          </div>
        )}
        {dialog && <ScreenshotCheckDialog control={control} proof={waiting} onClose={close} startRejecting />}
      </ScreenshotCard>
    );
  }

  if (!wait) return null;
  return (
    <section className={`${CARD} bg-status-review/40 grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,15rem)] sm:items-center`}>
      <PanelIcon name="image" className="text-status-review-foreground size-6 max-sm:hidden" />
      <div className="grid gap-1">
        <h2 className="text-sm">{wait.title}</h2>
        <p className="text-muted-foreground text-[13px] leading-relaxed">{wait.text}</p>
      </div>
      <WhatsAppLink phone={whatsApp.phone} message={whatsApp.message} />
    </section>
  );
}
