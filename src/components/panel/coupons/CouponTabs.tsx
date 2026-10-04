import Link from "next/link";
import { buildListPath } from "@/components/panel/list-path";
import { COUPON_TABS, type CouponTab } from "@/features/coupons/schemas";
import type { CouponTabCounts } from "@/features/coupons/staff-service";
import { COUPON_TAB_LABELS } from "@/features/coupons/status";
import { DEFAULT_PAGE_SIZE } from "@/features/shared/pagination";

/** All / Active / Scheduled / Expired / Used up / Inactive, one count each (mirrors `DiscountTabs`). */
export function CouponTabs({ currentTab, counts, q }: { currentTab: CouponTab; counts: CouponTabCounts; q?: string }) {
  return (
    <nav aria-label="Coupon status" className="no-scrollbar flex w-full gap-1 overflow-x-auto">
      {COUPON_TABS.map((tab) => {
        const active = tab === currentTab;
        return (
          <Link
            key={tab}
            href={buildListPath("/panel/coupons", tab === "all" ? undefined : tab, { q }, DEFAULT_PAGE_SIZE)}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {COUPON_TAB_LABELS[tab]}
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
