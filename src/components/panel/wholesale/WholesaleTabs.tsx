import Link from "next/link";
import type { StatusCounts } from "@/features/wholesale/staff-service";
import { STATUS_LABELS, WHOLESALE_STATUSES, wholesalePath, type WholesaleStatus } from "@/features/wholesale/transitions";

/** All / New / Contacted / Closed, one count each — simpler than the orders tabs, no alert dot. */
export function WholesaleTabs({
  currentTab,
  counts,
  q,
  pageSize,
}: {
  currentTab: WholesaleStatus | "all";
  counts: StatusCounts;
  q?: string;
  pageSize: number;
}) {
  const tabs: (WholesaleStatus | "all")[] = ["all", ...WHOLESALE_STATUSES];

  return (
    <nav aria-label="Inquiry status" className="no-scrollbar flex w-full gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab === currentTab;
        const label = tab === "all" ? "All" : STATUS_LABELS[tab];
        return (
          <Link
            key={tab}
            href={wholesalePath(tab, { q, pageSize })}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {label}
            <span
              className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-medium ${
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {counts[tab]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
