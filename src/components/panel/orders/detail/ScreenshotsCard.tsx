import { DetailCard } from "@/components/panel/orders/detail/DetailCard";
import { ProofImage } from "@/components/panel/orders/ProofImage";
import type { ProofView } from "@/features/orders/staff-service";

const STATUS_COLORS: Record<ProofView["status"], string> = {
  submitted: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  verified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-400",
};

/**
 * Only the screenshots staff have already decided on (verified or rejected): one still `submitted`
 * is already shown, with its Approve/Reject buttons, in the highlighted review card above — showing
 * it again here with a plain "To check" badge would just be the same screenshot twice. Cash on
 * delivery never has a screenshot at all, so the card doesn't render.
 */
export function ScreenshotsCard({ proofs, isCod }: { proofs: ProofView[]; isCod: boolean }) {
  if (isCod) return null;
  const decided = proofs.filter((proof) => proof.status !== "submitted");
  if (decided.length === 0) return null;

  return (
    <DetailCard title="Payment screenshots">
      <ul className="divide-border flex flex-col divide-y">
        {decided.map((proof) => (
          <li key={proof.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <ProofImage proofId={proof.id} label={`${proof.purposeLabel} screenshot`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{proof.purposeLabel}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[proof.status]}`}>{proof.statusLabel}</span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">Uploaded {proof.uploadedAt}</p>
              {proof.reviewed && <p className="text-muted-foreground text-xs">Reviewed by {proof.reviewed}</p>}
              {proof.rejectionReason && <p className="text-destructive text-xs">Reason: {proof.rejectionReason}</p>}
            </div>
          </li>
        ))}
      </ul>
    </DetailCard>
  );
}
