"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailCard } from "@/components/panel/DetailCard";
import { TAB_COLORS } from "@/components/panel/orders/tab-colors";
import { TAB_INFO, ordersPath } from "@/features/orders/transitions";
import type { RecentOrderView } from "@/features/dashboard/service";

/** Stops a click reaching the row's own navigation (the order-number link). */
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

function StatusPill({ order }: { order: RecentOrderView }) {
  const color = TAB_COLORS[order.tab];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${color.bg} ${color.text}`}>{TAB_INFO[order.tab].label}</span>;
}

function OrderRow({ order }: { order: RecentOrderView }) {
  const router = useRouter();
  return (
    <tr onClick={() => router.push(order.href)} className="hover:bg-secondary/50 cursor-pointer">
      <td className="py-2 pr-3">
        <Link href={order.href} onClick={stop} className="text-primary font-medium hover:underline">
          {order.orderNumber}
        </Link>
      </td>
      <td className="max-w-[140px] truncate py-2 pr-3">{order.customerName}</td>
      <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">{order.placedDate}</td>
      <td className="py-2 pr-3">
        <StatusPill order={order} />
      </td>
      <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">{order.paymentMethodLabel}</td>
      <td className="py-2 pr-0 text-right font-medium whitespace-nowrap">{order.total}</td>
    </tr>
  );
}

function OrderCard({ order }: { order: RecentOrderView }) {
  const router = useRouter();
  return (
    <li onClick={() => router.push(order.href)} className="bg-card border-border cursor-pointer rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={order.href} onClick={stop} className="text-primary font-medium hover:underline">
            {order.orderNumber}
          </Link>
          <p className="mt-0.5 truncate text-sm">{order.customerName}</p>
          <p className="text-muted-foreground text-xs">
            {order.placedDate} · {order.paymentMethodLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium whitespace-nowrap">{order.total}</p>
        </div>
      </div>
      <div className="mt-2">
        <StatusPill order={order} />
      </div>
    </li>
  );
}

/** Latest 8 orders across both payment methods, any status (C28) — the status pill reuses the orders list's own colours/labels. The whole row (not just the order number) opens the order. */
export function RecentOrdersTable({ orders }: { orders: RecentOrderView[] }) {
  return (
    <DetailCard
      title="Recent orders"
      action={
        <div className="flex gap-2 text-xs whitespace-nowrap sm:gap-3">
          <Link href={ordersPath("bank_transfer")} className="text-primary hover:underline">
            <span className="sm:hidden">Bank</span>
            <span className="hidden sm:inline">View bank transfer orders</span>
          </Link>
          <Link href={ordersPath("cod")} className="text-primary hover:underline">
            <span className="sm:hidden">COD</span>
            <span className="hidden sm:inline">View COD orders</span>
          </Link>
        </div>
      }
    >
      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">No orders yet.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="pb-2 font-medium">Order</th>
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Payment</th>
                  <th className="pb-2 pr-0 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {orders.map((order) => (
                  <OrderRow key={order.orderNumber} order={order} />
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {orders.map((order) => (
              <OrderCard key={order.orderNumber} order={order} />
            ))}
          </ul>
        </>
      )}
    </DetailCard>
  );
}
