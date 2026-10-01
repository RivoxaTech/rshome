import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { getOrderCounts, listStaffOrders } from "@/features/orders/staff-service";
import { orderListQuerySchema, type OrderListQuery } from "@/features/orders/schemas";
import { DEFAULT_PAGE_SIZE, METHOD_PAGES, PAGE_SIZE_OPTIONS, TAB_INFO, ordersPath, tabsFor, type OrderTab } from "@/features/orders/transitions";
import type { PaymentMethod } from "@/features/orders/status";
import { requirePermission } from "@/server/auth/permissions";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { OrderTabs } from "@/components/panel/orders/OrderTabs";
import { OrdersTable } from "@/components/panel/orders/OrdersTable";
import { OrdersTableSkeleton } from "@/components/panel/orders/OrdersTableSkeleton";
import { Pagination } from "@/components/panel/Pagination";
import { RowsPerPageSelect } from "@/components/panel/RowsPerPageSelect";
import { SearchBox } from "@/components/panel/SearchBox";

/**
 * The table and its pagination, in their own Suspense boundary (S9): the tabs and the search box
 * above render immediately from `getOrderCounts` (fast, independent of the tab/search/page), so a
 * tab click, a search or a page change only ever re-shows the skeleton for this part.
 */
async function OrdersTableSection({
  method,
  tab,
  query,
  permissions,
}: {
  method: PaymentMethod;
  tab: OrderTab | "all";
  query: OrderListQuery;
  permissions: ReadonlySet<PermissionKey>;
}) {
  const { items, page, pageCount, total, pageSize } = await listStaffOrders(
    method,
    tab,
    { q: query.q, page: query.page, pageSize: query.pageSize },
    permissions,
  );
  if (query.page > 1 && query.page > pageCount) redirect(ordersPath(method, tab, { q: query.q, page: pageCount, pageSize: query.pageSize }));

  const backHref = ordersPath(method, tab, { q: query.q, page, pageSize });
  return (
    <>
      <OrdersTable items={items} method={method} backHref={backHref} />
      <Pagination
        basePath={`/panel/orders/${METHOD_PAGES[method].slug}`}
        tabSlug={tab === "all" ? undefined : TAB_INFO[tab].slug}
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

export async function OrdersPageBody({
  method,
  searchParams,
}: {
  method: PaymentMethod;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await requirePermission(PERMISSIONS.ORDER_VIEW);
  const query = orderListQuerySchema.parse(searchParams);
  const tab = query.tab === "all" || tabsFor(method).includes(query.tab) ? query.tab : "all";

  const allCounts = await getOrderCounts();
  const counts = allCounts[method];

  return (
    <>
      <PanelPageTitle title={METHOD_PAGES[method].title} />
      <div className="flex flex-col gap-3">
        <OrderTabs method={method} currentTab={tab} counts={counts} q={query.q} pageSize={query.pageSize} />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 sm:max-w-[360px]">
            <SearchBox
              initialQ={query.q ?? ""}
              basePath={`/panel/orders/${METHOD_PAGES[method].slug}`}
              tabSlug={tab === "all" ? undefined : TAB_INFO[tab].slug}
              pageSize={query.pageSize}
              defaultPageSize={DEFAULT_PAGE_SIZE}
              placeholder="Search orders"
              ariaLabel="Search orders"
            />
          </div>
          <RowsPerPageSelect
            basePath={`/panel/orders/${METHOD_PAGES[method].slug}`}
            tabSlug={tab === "all" ? undefined : TAB_INFO[tab].slug}
            q={query.q}
            pageSize={query.pageSize}
            options={PAGE_SIZE_OPTIONS}
            defaultPageSize={DEFAULT_PAGE_SIZE}
          />
        </div>
        <Suspense key={`${tab}-${query.q ?? ""}-${query.page}-${query.pageSize}`} fallback={<OrdersTableSkeleton />}>
          <OrdersTableSection method={method} tab={tab} query={query} permissions={session.permissions} />
        </Suspense>
      </div>
    </>
  );
}
