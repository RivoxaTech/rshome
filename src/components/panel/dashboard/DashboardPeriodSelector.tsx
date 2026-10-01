import Link from "next/link";
import { RANGE_KEYS, RANGE_LABELS, dashboardPath, type RangeKey } from "@/features/dashboard/ranges";

/** The dashboard's period selector (C28): a plain link row, the same visual pattern as `OrderTabs`. */
export function DashboardPeriodSelector({ current }: { current: RangeKey }) {
  return (
    <nav aria-label="Period" className="no-scrollbar flex w-full gap-1 overflow-x-auto">
      {RANGE_KEYS.map((range) => {
        const active = range === current;
        return (
          <Link
            key={range}
            href={dashboardPath(range)}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {RANGE_LABELS[range]}
          </Link>
        );
      })}
    </nav>
  );
}
