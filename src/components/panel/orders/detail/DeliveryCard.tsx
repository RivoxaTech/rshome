import { DetailCard } from "@/components/panel/orders/detail/DetailCard";
import type { StaffOrderView } from "@/features/orders/staff-service";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Read-only: the delivery charge is entered only in the Approve dialog. Only the rows that have a
 * value show; before approval there is nothing to set yet. */
export function DeliveryCard({ delivery }: { delivery: StaffOrderView["delivery"] }) {
  const rows = [
    { label: "Charge", value: delivery.charge },
    { label: "Note", value: delivery.note },
    { label: "Courier", value: delivery.courier },
    { label: "Tracking", value: delivery.trackingNote },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  return (
    <DetailCard title="Delivery">
      {rows.length > 0 ? (
        rows.map((row) => <Row key={row.label} {...row} />)
      ) : (
        <p className="text-muted-foreground text-sm">Delivery charge is set when the order is approved.</p>
      )}
    </DetailCard>
  );
}
