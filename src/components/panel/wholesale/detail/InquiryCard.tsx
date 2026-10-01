import { DetailCard } from "@/components/panel/DetailCard";
import type { StaffWholesaleInquiryView } from "@/features/wholesale/staff-service";

export function InquiryCard({ inquiry }: { inquiry: StaffWholesaleInquiryView }) {
  return (
    <DetailCard title="Inquiry">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Business</dt>
          <dd>{inquiry.business ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Business type</dt>
          <dd>{inquiry.businessTypeLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">City</dt>
          <dd>{inquiry.city}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Needed by</dt>
          <dd>{inquiry.neededByDate ?? "Not specified"}</dd>
        </div>
      </dl>
      {inquiry.message && (
        <div className="border-border border-t pt-3 text-sm">
          <p className="text-muted-foreground text-xs">Message</p>
          <p className="mt-1 whitespace-pre-wrap">{inquiry.message}</p>
        </div>
      )}
    </DetailCard>
  );
}
