import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { Pagination } from "@/components/panel/Pagination";
import { RowsPerPageSelect } from "@/components/panel/RowsPerPageSelect";
import { SearchBox } from "@/components/panel/SearchBox";
import { buildListPath } from "@/components/panel/list-path";
import { CouponTabs } from "@/components/panel/coupons/CouponTabs";
import { CouponsTable } from "@/components/panel/coupons/CouponsTable";
import { CouponsTableSkeleton } from "@/components/panel/coupons/CouponsTableSkeleton";
import { PERMISSIONS } from "@/features/auth/permissions";
import { COUPON_DEFAULT_PAGE_SIZE, COUPON_PAGE_SIZE_OPTIONS, couponListQuerySchema, type CouponListQuery } from "@/features/coupons/schemas";
import { listStaffCoupons } from "@/features/coupons/staff-service";
import { requirePermission } from "@/server/auth/permissions";

const BASE_PATH = "/panel/coupons";

function couponsPath(query: { tab?: string; q?: string; page?: number; pageSize?: number }): string {
  return buildListPath(BASE_PATH, query.tab === "all" ? undefined : query.tab, query, COUPON_DEFAULT_PAGE_SIZE);
}

/** The tabs, table and pagination in one Suspense boundary (the counts come from the same in-memory status pass as the rows). */
async function CouponsListSection({ query, backHref }: { query: CouponListQuery; backHref: string }) {
  await requirePermission(PERMISSIONS.COUPON_MANAGE);
  const { items, counts, page, pageCount, total, pageSize } = await listStaffCoupons({ tab: query.tab, q: query.q, page: query.page, pageSize: query.pageSize });
  if (query.page > 1 && query.page > pageCount) redirect(couponsPath({ tab: query.tab, q: query.q, page: pageCount, pageSize: query.pageSize }));

  return (
    <>
      <CouponTabs currentTab={query.tab} counts={counts} q={query.q} />
      <CouponsTable items={items} backHref={backHref} />
      <Pagination
        basePath={BASE_PATH}
        tabSlug={query.tab === "all" ? undefined : query.tab}
        q={query.q}
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        defaultPageSize={COUPON_DEFAULT_PAGE_SIZE}
      />
    </>
  );
}

export async function CouponsPageBody({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.COUPON_MANAGE);
  const query = couponListQuerySchema.parse(searchParams);
  const backHref = couponsPath({ tab: query.tab, q: query.q, page: query.page, pageSize: query.pageSize });

  return (
    <>
      <PanelPageTitle title="Coupons" />
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:max-w-[320px] sm:flex-1">
            <SearchBox
              initialQ={query.q ?? ""}
              basePath={BASE_PATH}
              tabSlug={query.tab === "all" ? undefined : query.tab}
              pageSize={query.pageSize}
              defaultPageSize={COUPON_DEFAULT_PAGE_SIZE}
              placeholder="Search by code"
              ariaLabel="Search coupons by code"
            />
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <RowsPerPageSelect
              basePath={BASE_PATH}
              tabSlug={query.tab === "all" ? undefined : query.tab}
              q={query.q}
              pageSize={query.pageSize}
              options={COUPON_PAGE_SIZE_OPTIONS}
              defaultPageSize={COUPON_DEFAULT_PAGE_SIZE}
            />
            <Link
              href={`/panel/coupons/new?back=${encodeURIComponent(backHref)}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              New coupon
            </Link>
          </div>
        </div>
        <Suspense key={`${query.tab}-${query.q ?? ""}-${query.page}-${query.pageSize}`} fallback={<CouponsTableSkeleton />}>
          <CouponsListSection query={query} backHref={backHref} />
        </Suspense>
      </div>
    </>
  );
}
