import Link from "next/link";
import { DetailCard } from "@/components/panel/DetailCard";
import type { CouponUsageSummary } from "@/features/coupons/staff-service";

/**
 * Usage so far (S13): the live count and dates for everyone; order numbers link to the orders
 * pages only when the viewer holds `order.view` — the Developer doesn't (C24), so they see
 * counts and dates and nothing about the customer.
 */
export function CouponUsageCard({ usage, usageLimit }: { usage: CouponUsageSummary; usageLimit: number | null }) {
  return (
    <DetailCard title="Usage so far">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Orders</dt>
        <dd className="tabular-nums">
          {usage.count}
          {usageLimit !== null && <span className="text-muted-foreground"> of {usageLimit}</span>}
        </dd>
        <dt className="text-muted-foreground">Last used</dt>
        <dd>{usage.lastUsedAt ?? "Never"}</dd>
      </dl>
      {usage.recent.length > 0 && (
        <ul className="border-border divide-border mt-1 divide-y border-t text-sm">
          {usage.recent.map((row, index) => (
            <li key={index} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-muted-foreground text-xs">{row.at}</span>
              {row.order ? (
                <Link href={`/panel/orders/${row.order.paymentMethod === "cod" ? "cod" : "bank"}/${row.order.orderNumber}`} className="text-primary font-mono text-xs hover:underline">
                  {row.order.orderNumber}
                </Link>
              ) : (
                <span className="text-muted-foreground text-xs">1 order</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {usage.count > usage.recent.length && <p className="text-muted-foreground text-xs">Showing the {usage.recent.length} most recent.</p>}
    </DetailCard>
  );
}
