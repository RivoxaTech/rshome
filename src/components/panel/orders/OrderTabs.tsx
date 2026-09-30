import Link from "next/link";
import type { TabCounts } from "@/features/orders/staff-service";
import type { PaymentMethod } from "@/features/orders/status";
import { TAB_INFO, ordersPath, tabsFor, type OrderTab } from "@/features/orders/transitions";

/**
 * The status tabs (C21, C22): All then each tab with its one count. A tab holding orders with a
 * screenshot to check shows a small dot, not a second number. The search stays.
 */
export function OrderTabs({ method, active, counts, q }: { method: PaymentMethod; active: OrderTab | "all"; counts: TabCounts; q?: string }) {
  const tabs: { key: OrderTab | "all"; label: string }[] = [{ key: "all", label: "All" }, ...tabsFor(method).map((tab) => ({ key: tab, label: TAB_INFO[tab].label }))];

  return (
    <nav aria-label="Order status" className="border-border no-scrollbar flex overflow-x-auto border-b px-2">
      {tabs.map(({ key, label }) => {
        const selected = key === active;
        const toCheck = key === "all" ? 0 : counts.toCheck[key];
        return (
          <Link
            key={key}
            href={ordersPath(method, key, { q })}
            aria-current={selected ? "page" : undefined}
            className={`relative flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full ${
              selected ? "text-foreground after:bg-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span className={`h-5 min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 tabular-nums ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {counts[key]}
            </span>
            {toCheck > 0 && (
              <span title={`${toCheck} with a screenshot to check`} className="bg-status-pending-foreground size-1.5 rounded-full">
                <span className="sr-only">, {toCheck} with a screenshot to check</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
