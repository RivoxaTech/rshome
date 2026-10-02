import Link from "next/link";
import { buildListPath } from "@/components/panel/list-path";
import { PRODUCT_DEFAULT_PAGE_SIZE, PRODUCT_TABS, type ProductTab } from "@/features/catalog/schemas";
import type { ProductStatusCounts } from "@/features/catalog/products-staff-repo";

const TAB_LABELS: Record<ProductTab, string> = { all: "All", active: "Active", draft: "Draft", archived: "Archived" };

/** All / Active / Draft / Archived, one count each (mirrors `WholesaleTabs`). */
export function ProductTabs({ currentTab, counts, q, category }: { currentTab: ProductTab; counts: ProductStatusCounts; q?: string; category?: string }) {
  return (
    <nav aria-label="Product status" className="no-scrollbar flex w-full gap-1 overflow-x-auto">
      {PRODUCT_TABS.map((tab) => {
        const active = tab === currentTab;
        return (
          <Link
            key={tab}
            href={buildListPath("/panel/products", tab === "all" ? undefined : tab, { q, category }, PRODUCT_DEFAULT_PAGE_SIZE)}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {TAB_LABELS[tab]}
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
