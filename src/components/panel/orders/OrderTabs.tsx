import Link from "next/link";
import type { TabCounts } from "@/features/orders/staff-service";
import type { PaymentMethod } from "@/features/orders/status";
import { TAB_INFO, ordersPath, tabsFor, type OrderTab } from "@/features/orders/transitions";

/**
 * The status tabs (C21, like the reference's): All then each tab with its count. Pending delivery
 * charge also shows how many delivery charge screenshots wait to be checked. The search stays.
 */
export function OrderTabs({ method, active, counts, q }: { method: PaymentMethod; active: OrderTab | "all"; counts: TabCounts; q?: string }) {
  const tabs: { key: OrderTab | "all"; label: string }[] = [{ key: "all", label: "All" }, ...tabsFor(method).map((tab) => ({ key: tab, label: TAB_INFO[tab].label }))];

  return (
    <nav aria-label="Order status" className="border-border no-scrollbar -mx-4 flex overflow-x-auto border-b px-2 sm:-mx-5 sm:px-3">
      {tabs.map(({ key, label }) => {
        const selected = key === active;
        const alert = key === "pending_delivery" ? counts.toCheck : 0;
        return (
          <Link
            key={key}
            href={ordersPath(method, key, { q })}
            aria-current={selected ? "page" : undefined}
            className={`relative flex min-h-12 shrink-0 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full ${
              selected ? "text-foreground after:bg-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {counts[key]}
            </span>
            {alert > 0 && (
              <span
                title={`${alert} delivery charge ${alert === 1 ? "screenshot" : "screenshots"} to check`}
                className="bg-status-pending-foreground text-card flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
              >
                <span className="sr-only">, screenshots to check: </span>
                {alert}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
