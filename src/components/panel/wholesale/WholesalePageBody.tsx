import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { Pagination } from "@/components/panel/Pagination";
import { RowsPerPageSelect } from "@/components/panel/RowsPerPageSelect";
import { SearchBox } from "@/components/panel/SearchBox";
import { WholesaleTable } from "@/components/panel/wholesale/WholesaleTable";
import { WholesaleTableSkeleton } from "@/components/panel/wholesale/WholesaleTableSkeleton";
import { WholesaleTabs } from "@/components/panel/wholesale/WholesaleTabs";
import { PERMISSIONS } from "@/features/auth/permissions";
import { wholesaleListQuerySchema, type WholesaleListQuery } from "@/features/wholesale/schemas";
import { getWholesaleInquiryCounts, listStaffWholesaleInquiries } from "@/features/wholesale/staff-service";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, WHOLESALE_STATUSES, wholesalePath, type WholesaleStatus } from "@/features/wholesale/transitions";
import { requirePermission } from "@/server/auth/permissions";

/**
 * The table and its pagination, in their own Suspense boundary (mirrors the orders list, S9): the
 * tabs and the search box above render immediately from `getWholesaleInquiryCounts` (fast,
 * independent of the tab/search/page), so a tab click, a search or a page change only ever
 * re-shows the skeleton for this part.
 */
async function WholesaleTableSection({
  tab,
  query,
}: {
  tab: WholesaleStatus | "all";
  query: WholesaleListQuery;
}) {
  const session = await requirePermission(PERMISSIONS.WHOLESALE_VIEW);
  const { items, page, pageCount, total, pageSize } = await listStaffWholesaleInquiries(
    tab,
    { q: query.q, page: query.page, pageSize: query.pageSize },
    session.permissions,
  );
  if (query.page > 1 && query.page > pageCount) redirect(wholesalePath(tab, { q: query.q, page: pageCount, pageSize: query.pageSize }));

  const backHref = wholesalePath(tab, { q: query.q, page, pageSize });
  return (
    <>
      <WholesaleTable items={items} backHref={backHref} />
      <Pagination
        basePath="/panel/wholesale"
        tabSlug={tab === "all" ? undefined : tab}
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

export async function WholesalePageBody({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.WHOLESALE_VIEW);
  const query = wholesaleListQuerySchema.parse(searchParams);
  const tab = query.tab === "all" || (WHOLESALE_STATUSES as readonly string[]).includes(query.tab) ? query.tab : "all";

  const counts = await getWholesaleInquiryCounts();

  return (
    <>
      <PanelPageTitle title="Wholesale inquiries" />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <WholesaleTabs currentTab={tab} counts={counts} q={query.q} pageSize={query.pageSize} />
          <a
            href={`/api/panel/wholesale/export?${new URLSearchParams({ ...(tab !== "all" ? { tab } : {}), ...(query.q ? { q: query.q } : {}) }).toString()}`}
            className="border-input hover:bg-secondary shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap"
          >
            Export
          </a>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 sm:max-w-[360px]">
            <SearchBox
              initialQ={query.q ?? ""}
              basePath="/panel/wholesale"
              tabSlug={tab === "all" ? undefined : tab}
              pageSize={query.pageSize}
              defaultPageSize={DEFAULT_PAGE_SIZE}
              placeholder="Search inquiries"
              ariaLabel="Search inquiries"
            />
          </div>
          <RowsPerPageSelect
            basePath="/panel/wholesale"
            tabSlug={tab === "all" ? undefined : tab}
            q={query.q}
            pageSize={query.pageSize}
            options={PAGE_SIZE_OPTIONS}
            defaultPageSize={DEFAULT_PAGE_SIZE}
          />
        </div>
        <Suspense key={`${tab}-${query.q ?? ""}-${query.page}-${query.pageSize}`} fallback={<WholesaleTableSkeleton />}>
          <WholesaleTableSection tab={tab} query={query} />
        </Suspense>
      </div>
    </>
  );
}
