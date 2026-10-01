import { DetailCard } from "@/components/panel/DetailCard";
import type { StaffOrderView } from "@/features/orders/staff-service";

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground" : ""}>{value}</span>
    </div>
  );
}

export function PaymentSummaryCard({ totals, isCod }: { totals: StaffOrderView["totals"]; isCod: boolean }) {
  return (
    <DetailCard title="Payment summary">
      <Row label="Subtotal" value={totals.subtotal} />
      {totals.discountTotal && <Row label="Discount" value={`- ${totals.discountTotal}`} />}
      {totals.coupon && <Row label={`Coupon ${totals.coupon.code}`} value={`- ${totals.coupon.discount}`} />}
      <Row label="Products total" value={totals.goodsTotal} />
      <Row label="Delivery charge" value={totals.deliveryCharge ?? "To be confirmed"} muted={!totals.deliveryCharge} />
      <div className="bg-secondary/60 mt-1 flex items-center justify-between gap-4 rounded-md px-2.5 py-2 text-sm font-semibold">
        <span>{isCod ? "Total to collect in cash" : "Total"}</span>
        <span>{totals.total}</span>
      </div>
    </DetailCard>
  );
}
