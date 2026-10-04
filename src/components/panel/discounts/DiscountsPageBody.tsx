import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { Pagination } from "@/components/panel/Pagination";
import { RowsPerPageSelect } from "@/components/panel/RowsPerPageSelect";
import { SearchBox } from "@/components/panel/SearchBox";
import { buildListPath } from "@/components/panel/list-path";
import { DiscountTabs } from "@/components/panel/discounts/DiscountTabs";
import { DiscountsTable } from "@/components/panel/discounts/DiscountsTable";
import { DiscountsTableSkeleton } from "@/components/panel/discounts/DiscountsTableSkeleton";
import { PERMISSIONS } from "@/features/auth/permissions";
import { discountListQuerySchema, type DiscountListQuery } from "@/features/discounts/schemas";
import { listStaffDiscounts } from "@/features/discounts/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from "@/features/shared/pagination";

const BASE_PATH = "/panel/discounts";

function discountsPath(query: { tab?: string; q?: string; page?: number; pageSize?: number }): string {
  return buildListPath(BASE_PATH, query.tab === "all" ? undefined : query.tab, query, DEFAULT_PAGE_SIZE);
}

/**
 * The tabs, table and pagination in one Suspense boundary (the tab counts come from the same
 * in-memory status pass as the rows, so they load together): a tab, search or page change only
 * ever re-shows the skeleton here, never a blank page.
 */
async function DiscountsListSection({ query, backHref }: { query: DiscountListQuery; backHref: string }) {
  await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const { items, counts, page, pageCount, total, pageSize } = await listStaffDiscounts({ tab: query.tab, q: query.q, page: query.page, pageSize: query.pageSize });
  if (query.page > 1 && query.page > pageCount) redirect(discountsPath({ tab: query.tab, q: query.q, page: pageCount, pageSize: query.pageSize }));

  return (
    <>
      <DiscountTabs currentTab={query.tab} counts={counts} q={query.q} />
      <DiscountsTable items={items} backHref={backHref} />
      <Pagination
        basePath={BASE_PATH}
        tabSlug={query.tab === "all" ? undefined : query.tab}
        q={query.q}
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        defaultPageSize={DEFAULT_PAGE_SIZE}
      />
    </>
  );
}

export async function DiscountsPageBody({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const query = discountListQuerySchema.parse(searchParams);
  const backHref = discountsPath({ tab: query.tab, q: query.q, page: query.page, pageSize: query.pageSize });

  return (
    <>
      <PanelPageTitle title="Discounts" />
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:max-w-[320px] sm:flex-1">
            <SearchBox
              initialQ={query.q ?? ""}
              basePath={BASE_PATH}
              tabSlug={query.tab === "all" ? undefined : query.tab}
              pageSize={query.pageSize}
              defaultPageSize={DEFAULT_PAGE_SIZE}
              placeholder="Search discounts"
              ariaLabel="Search discounts"
            />
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <RowsPerPageSelect
              basePath={BASE_PATH}
              tabSlug={query.tab === "all" ? undefined : query.tab}
              q={query.q}
              pageSize={query.pageSize}
              options={PAGE_SIZE_OPTIONS}
              defaultPageSize={DEFAULT_PAGE_SIZE}
            />
            <Link
              href={`/panel/discounts/new?back=${encodeURIComponent(backHref)}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              New discount
            </Link>
          </div>
        </div>
        <Suspense key={`${query.tab}-${query.q ?? ""}-${query.page}-${query.pageSize}`} fallback={<DiscountsTableSkeleton />}>
          <DiscountsListSection query={query} backHref={backHref} />
        </Suspense>
      </div>
    </>
  );
}
