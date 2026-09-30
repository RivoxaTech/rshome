import Link from "next/link";
import { PanelIcon } from "@/components/panel/icons";
import type { StaffOrderListItem } from "@/features/orders/staff-service";
import { CloseOrderButton, StatusSelect } from "./StatusControls";

function detailHref(orderNumber: string, from: string) {
  return `/panel/orders/${orderNumber}?from=${encodeURIComponent(from)}`;
}

/** The small dot on a row whose delivery charge screenshot waits to be checked. */
function AlertDot() {
  return (
    <span className="relative flex size-2.5 shrink-0">
      <span aria-hidden="true" className="bg-status-pending-foreground absolute inset-0 animate-ping rounded-full opacity-40 motion-reduce:hidden" />
      <span className="bg-status-pending-foreground relative size-2.5 rounded-full" />
      <span className="sr-only">Delivery charge screenshot to check</span>
    </span>
  );
}

function Waiting({ text }: { text: string | null }) {
  return text ? <p className="text-muted-foreground mt-1 text-xs">{text}</p> : null;
}

/**
 * One page of orders (C21): a table from `md` (S.N, order, date, customer, status, total, trash),
 * clean cards on phones with the same content. `from` is this list's URL, so the detail page's
 * back link returns to the same tab, search and page.
 */
export function OrdersTable({ items, from, emptyText }: { items: StaffOrderListItem[]; from: string; emptyText: string }) {
  if (items.length === 0) {
    return (
      <div className="text-muted-foreground grid place-items-center gap-3 py-16 text-center text-sm">
        <PanelIcon name="inbox" className="h-10 w-10 opacity-60" />
        {emptyText}
      </div>
    );
  }

  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="text-muted-foreground border-border border-b text-left text-xs font-medium tracking-wide uppercase">
            <th scope="col" className="w-14 py-3 pr-2 pl-5 font-medium">
              S.N
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Order
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Date
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Customer
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Total
            </th>
            <th scope="col" className="w-16 py-3 pr-5 pl-3">
              <span className="sr-only">Cancel or reject</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {items.map((order) => (
            <tr key={order.orderNumber} className={`transition-colors hover:bg-muted/60 ${order.screenshotToCheck ? "bg-status-pending/40" : ""}`}>
              <td className="text-muted-foreground py-3.5 pr-2 pl-5 tabular-nums">{order.serial}</td>
              <td className="px-3 py-3.5">
                <div className="flex items-center gap-2">
                  {order.screenshotToCheck && <AlertDot />}
                  <Link href={detailHref(order.orderNumber, from)} className="text-link font-semibold whitespace-nowrap hover:underline">
                    {order.orderNumber}
                  </Link>
                </div>
              </td>
              <td className="px-3 py-3.5 whitespace-nowrap">
                {order.placedDate}
                <span className="text-muted-foreground ml-1.5 text-xs">{order.placedTime}</span>
              </td>
              <td className="max-w-56 truncate px-3 py-3.5">{order.customerName}</td>
              <td className="px-3 py-3.5">
                <StatusSelect control={order.control} />
                <Waiting text={order.control.waiting} />
              </td>
              <td className="px-3 py-3.5 text-right font-medium whitespace-nowrap tabular-nums">{order.total}</td>
              <td className="py-2 pr-5 pl-3 text-right">
                <CloseOrderButton control={order.control} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-border divide-y md:hidden">
        {items.map((order) => (
          <li key={order.orderNumber} className={`grid gap-2.5 px-4 py-4 ${order.screenshotToCheck ? "bg-status-pending/40" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs tabular-nums">#{order.serial}</span>
                  {order.screenshotToCheck && <AlertDot />}
                  <Link href={detailHref(order.orderNumber, from)} className="text-link font-semibold hover:underline">
                    {order.orderNumber}
                  </Link>
                </div>
                <p className="mt-1 truncate">{order.customerName}</p>
                <p className="text-muted-foreground text-xs">
                  {order.placedDate}, {order.placedTime}
                </p>
              </div>
              <div className="-mt-1.5 -mr-2">
                <CloseOrderButton control={order.control} />
              </div>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <StatusSelect control={order.control} />
                <Waiting text={order.control.waiting} />
              </div>
              <p className="font-semibold whitespace-nowrap tabular-nums">{order.total}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
