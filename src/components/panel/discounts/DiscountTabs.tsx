import Link from "next/link";
import { buildListPath } from "@/components/panel/list-path";
import { DISCOUNT_TABS, type DiscountTab } from "@/features/discounts/schemas";
import type { DiscountTabCounts } from "@/features/discounts/staff-service";
import { DISCOUNT_TAB_LABELS } from "@/features/discounts/status";
import { DEFAULT_PAGE_SIZE } from "@/features/shared/pagination";

/** All / Active now / Scheduled / Expired / Inactive, one count each (mirrors `ProductTabs`). */
export function DiscountTabs({ currentTab, counts, q }: { currentTab: DiscountTab; counts: DiscountTabCounts; q?: string }) {
  return (
    <nav aria-label="Discount status" className="no-scrollbar flex w-full gap-1 overflow-x-auto">
      {DISCOUNT_TABS.map((tab) => {
        const active = tab === currentTab;
        return (
          <Link
            key={tab}
            href={buildListPath("/panel/discounts", tab === "all" ? undefined : tab, { q }, DEFAULT_PAGE_SIZE)}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {DISCOUNT_TAB_LABELS[tab]}
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
