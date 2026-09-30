import { OrderTabs } from "@/components/panel/orders/OrderTabs";
import { OrdersTable } from "@/components/panel/orders/OrdersTable";
import { Pagination } from "@/components/panel/orders/Pagination";
import { SearchBox } from "@/components/panel/orders/SearchBox";
import { PERMISSIONS } from "@/features/auth/permissions";
import { orderListQuerySchema } from "@/features/orders/schemas";
import { getOrderCounts, listStaffOrders } from "@/features/orders/staff-service";
import type { PaymentMethod } from "@/features/orders/status";
import { METHOD_PAGES, TAB_INFO, ordersPath, tabsFor } from "@/features/orders/transitions";
import { requirePermission } from "@/server/auth/permissions";

/**
 * One payment method's orders (owner decision C21): status tabs with counts, a search box and a
 * page of 20. Tab, search and page live in the URL. A row's status pill offers the next steps.
 */
export async function OrdersPage({ method, searchParams }: { method: PaymentMethod; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission(PERMISSIONS.ORDER_VIEW);
  const query = orderListQuerySchema.parse(await searchParams);
  const tab = query.tab !== "all" && tabsFor(method).includes(query.tab) ? query.tab : "all";
  const [result, counts] = await Promise.all([listStaffOrders(method, tab, query, session.permissions), getOrderCounts()]);
  const here = ordersPath(method, tab, { q: query.q, page: result.page });

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl tracking-tight">{METHOD_PAGES[method].title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {counts[method].needsAction > 0 ? `${counts[method].needsAction} need your action` : "Nothing waiting for you"}
        </p>
      </div>

      <section className="bg-card border-border min-w-0 rounded-xl border shadow-sm">
        <div className="px-4 sm:px-5">
          <OrderTabs method={method} active={tab} counts={counts[method]} q={query.q} />
        </div>
        <div className="px-4 py-4 sm:px-5">
          <SearchBox key={`${method}:${tab}`} action={ordersPath(method)} tab={tab === "all" ? null : TAB_INFO[tab].slug} value={query.q ?? ""} />
        </div>
        <OrdersTable
          items={result.items}
          from={here}
          emptyText={query.q ? `No orders match “${query.q}”.` : tab === "all" ? "No orders yet." : `No orders in ${TAB_INFO[tab].label}.`}
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          pageSize={result.pageSize}
          total={result.total}
          hrefFor={(page) => ordersPath(method, tab, { q: query.q, page })}
        />
      </section>
    </div>
  );
}
