import { DetailCard } from "@/components/panel/DetailCard";
import type { StaffWholesaleInquiryView } from "@/features/wholesale/staff-service";

export function ItemsCard({ items }: { items: StaffWholesaleInquiryView["items"] }) {
  return (
    <DetailCard title="Items requested">
      <ul className="divide-border flex flex-col divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.itemName}</p>
              {item.note && <p className="text-muted-foreground text-xs">{item.note}</p>}
            </div>
            <p className="text-muted-foreground shrink-0 text-sm">Qty {item.quantity}</p>
          </li>
        ))}
      </ul>
    </DetailCard>
  );
}
