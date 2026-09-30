"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { PanelIcon } from "@/components/panel/icons";
import type { StaffOrderListItem } from "@/features/orders/staff-service";
import { CloseOrderButton, StatusMenu } from "./StatusControls";

function detailHref(orderNumber: string, from: string) {
  return `/panel/orders/${orderNumber}?from=${encodeURIComponent(from)}`;
}

/** Clicks on the row's own controls, their menus and dialogs are theirs, not the row's. */
const CONTROLS = "a, button, input, select, textarea, label, dialog, [role='menu']";

/**
 * The whole row (or phone card) opens the order (C22), except its status menu and trash icon.
 * Ctrl/⌘-click and a middle click open it in a new tab, like the order number's real link, which
 * keyboard users follow. Selecting text in the row doesn't navigate.
 */
function useRowLink(href: string) {
  const router = useRouter();
  const ignored = (event: MouseEvent) => (event.target as Element).closest(CONTROLS) !== null || Boolean(window.getSelection()?.toString());
  return {
    onClick: (event: MouseEvent) => {
      if (ignored(event)) return;
      if (event.ctrlKey || event.metaKey) window.open(href, "_blank", "noopener");
      else router.push(href);
    },
    onAuxClick: (event: MouseEvent) => {
      if (event.button === 1 && !ignored(event)) window.open(href, "_blank", "noopener");
    },
  };
}

/** The small dot on a row with a payment screenshot waiting to be checked. */
function AlertDot() {
  return (
    <span className="relative flex size-2 shrink-0">
      <span aria-hidden="true" className="bg-status-pending-foreground absolute inset-0 animate-ping rounded-full opacity-40 motion-reduce:hidden" />
      <span className="bg-status-pending-foreground relative size-2 rounded-full" />
      <span className="sr-only">Payment screenshot to check</span>
    </span>
  );
}

function Waiting({ text }: { text: string | null }) {
  return text ? <p className="text-muted-foreground mt-0.5 text-xs">{text}</p> : null;
}

function TableRow({ order, from }: { order: StaffOrderListItem; from: string }) {
  const href = detailHref(order.orderNumber, from);
  return (
    <tr {...useRowLink(href)} className={`hover:bg-muted/60 cursor-pointer transition-colors ${order.screenshotToCheck ? "bg-status-pending/40" : ""}`}>
      <td className="text-muted-foreground py-2.5 pr-2 pl-4 tabular-nums">{order.serial}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {order.screenshotToCheck && <AlertDot />}
          <Link href={href} className="text-link font-semibold whitespace-nowrap hover:underline">
            {order.orderNumber}
          </Link>
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {order.placedDate}
        <span className="text-muted-foreground ml-1.5 text-xs">{order.placedTime}</span>
      </td>
      <td className="max-w-56 truncate px-3 py-2.5">{order.customerName}</td>
      <td className="px-3 py-2.5">
        <StatusMenu control={order.control} />
        <Waiting text={order.control.waiting} />
      </td>
      <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{order.total}</td>
      <td className="py-1 pr-3 pl-2 text-right">
        <CloseOrderButton control={order.control} />
      </td>
    </tr>
  );
}

function Card({ order, from }: { order: StaffOrderListItem; from: string }) {
  const href = detailHref(order.orderNumber, from);
  return (
    <li {...useRowLink(href)} className={`grid cursor-pointer gap-2 px-4 py-3 ${order.screenshotToCheck ? "bg-status-pending/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs tabular-nums">#{order.serial}</span>
            {order.screenshotToCheck && <AlertDot />}
            <Link href={href} className="text-link font-semibold hover:underline">
              {order.orderNumber}
            </Link>
          </div>
          <p className="mt-0.5 truncate">{order.customerName}</p>
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
          <StatusMenu control={order.control} />
          <Waiting text={order.control.waiting} />
        </div>
        <p className="font-semibold whitespace-nowrap tabular-nums">{order.total}</p>
      </div>
    </li>
  );
}

/**
 * One page of orders (C21, C22): a table from `md` (S.N, order, date, customer, status, total,
 * trash), cards on phones with the same content. `from` is this list's URL, so the detail page's
 * back link returns to the same tab, search and page.
 */
export function OrdersTable({ items, from, emptyText }: { items: StaffOrderListItem[]; from: string; emptyText: string }) {
  if (items.length === 0) {
    return (
      <div className="text-muted-foreground grid place-items-center gap-3 py-14 text-center text-[13px]">
        <PanelIcon name="inbox" className="size-9 opacity-60" />
        {emptyText}
      </div>
    );
  }

  return (
    <>
      <table className="hidden w-full text-[13px] md:table">
        <thead>
          <tr className="text-muted-foreground border-border border-b text-left text-[11px] font-medium tracking-wide uppercase">
            <th scope="col" className="w-12 py-2.5 pr-2 pl-4 font-medium">
              S.N
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Order
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Date
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Customer
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Total
            </th>
            <th scope="col" className="w-14 py-2.5 pr-3 pl-2">
              <span className="sr-only">Cancel or reject</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {items.map((order) => (
            <TableRow key={order.orderNumber} order={order} from={from} />
          ))}
        </tbody>
      </table>

      <ul className="divide-border divide-y text-[13px] md:hidden">
        {items.map((order) => (
          <Card key={order.orderNumber} order={order} from={from} />
        ))}
      </ul>
    </>
  );
}
