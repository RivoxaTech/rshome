import Link from "next/link";
import type { TabCounts } from "@/features/orders/staff-service";
import { ORDER_TABS, TAB_INFO, ordersPath, tabsFor, type OrderTab } from "@/features/orders/transitions";
import type { PaymentMethod } from "@/features/orders/status";

/** The method page's tabs (C21): All, then its tabs in order, each with a count pill and, when a screenshot is waiting, a dot. */
export function OrderTabs({
  method,
  currentTab,
  counts,
  q,
  pageSize,
}: {
  method: PaymentMethod;
  currentTab: OrderTab | "all";
  counts: TabCounts;
  q?: string;
  pageSize: number;
}) {
  const tabs: (OrderTab | "all")[] = ["all", ...tabsFor(method)];
  const anyToCheck = ORDER_TABS.some((tab) => counts.toCheck[tab] > 0);

  return (
    <nav aria-label="Order status" className="no-scrollbar flex w-full gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab === currentTab;
        const label = tab === "all" ? "All" : TAB_INFO[tab].label;
        const count = tab === "all" ? counts.all : counts[tab];
        const dot = tab === "all" ? anyToCheck : counts.toCheck[tab] > 0;
        return (
          <Link
            key={tab}
            href={ordersPath(method, tab, { q, pageSize })}
            aria-current={active ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {label}
            <span
              className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-medium ${
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {count}
            </span>
            {dot && <span className="bg-destructive absolute top-1 right-1 h-1.5 w-1.5 rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
}
