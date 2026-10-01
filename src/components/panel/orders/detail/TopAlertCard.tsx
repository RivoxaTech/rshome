import { DetailCard } from "@/components/panel/DetailCard";
import { ProofImage } from "@/components/panel/orders/ProofImage";
import { ScreenshotReview } from "@/components/panel/orders/ScreenshotReview";
import { WhatsAppButton, whatsAppHref } from "@/components/store/WhatsAppButton";
import type { OrderControl, StaffOrderView } from "@/features/orders/staff-service";

/**
 * The top-of-page alert (C22): a waiting screenshot to check wins over everything else, then the
 * Need review products screenshot (approved from the header's primary button), then a plain
 * message when the order is simply waiting on the customer. Null when none of these apply.
 */
const HIGHLIGHT = "border-primary/30 bg-primary/5";

export function TopAlertCard({
  control,
  customerWait,
  whatsApp,
  onDone,
  onRejectScreenshot,
}: {
  control: OrderControl;
  customerWait: StaffOrderView["customerWait"];
  whatsApp: StaffOrderView["whatsApp"];
  onDone: () => void;
  onRejectScreenshot: () => void;
}) {
  if (control.toCheck.length > 0) {
    return (
      <DetailCard title="Screenshot to check" className={HIGHLIGHT}>
        <div className="flex flex-col gap-4">
          {control.toCheck.map((item) => (
            <ScreenshotReview key={item.id} item={item} onDone={onDone} />
          ))}
        </div>
      </DetailCard>
    );
  }

  if (control.tab === "need_review" && !control.isCod && control.goodsProof?.status === "submitted") {
    return (
      <DetailCard title="Products payment screenshot to check" className={HIGHLIGHT}>
        <div className="flex items-center gap-3">
          <ProofImage proofId={control.goodsProof.id} label="Products payment screenshot" />
          <p className="text-muted-foreground flex-1 text-sm">Amount to check: {control.goodsTotal}</p>
          <button type="button" onClick={onRejectScreenshot} className="text-destructive shrink-0 text-sm hover:underline">
            Reject order
          </button>
        </div>
      </DetailCard>
    );
  }

  if (customerWait) {
    return (
      <DetailCard title={customerWait.title}>
        <p className="text-muted-foreground text-sm">{customerWait.text}</p>
        <div>
          <WhatsAppButton href={whatsAppHref(whatsApp.phone, whatsApp.message)} label="Message on WhatsApp" />
        </div>
      </DetailCard>
    );
  }

  return null;
}
