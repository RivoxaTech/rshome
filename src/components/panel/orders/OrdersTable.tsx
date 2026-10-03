"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { OrderDialogs } from "@/components/panel/orders/OrderDialogs";
import { StatusMenu } from "@/components/panel/orders/StatusMenu";
import type { OpenDialog } from "@/components/panel/orders/types";
import type { StaffOrderListItem } from "@/features/orders/staff-service";
import { METHOD_PAGES, trashActionForTab, type TrashAction } from "@/features/orders/transitions";
import type { PaymentMethod } from "@/features/orders/status";

function detailHref(method: PaymentMethod, orderNumber: string, backHref: string): string {
  return `/panel/orders/${METHOD_PAGES[method].slug}/${orderNumber}?back=${encodeURIComponent(backHref)}`;
}

/** Stops a click reaching the row's own navigation (the status pill and the trash icon). */
function stop(event: React.MouseEvent | React.KeyboardEvent) {
  event.stopPropagation();
}

/** A corner badge (not inline before the order number, which used to push it onto a second line at narrow widths). */
function AlertDot() {
  return <span title="Screenshot to check" className="bg-destructive absolute top-1 left-1 h-2 w-2 rounded-full" />;
}

const TRASH_LABEL: Record<Exclude<TrashAction, null>, string> = {
  close: "Cancel or reject order",
  delete: "Delete order",
};

/** Null once an order is out for delivery or completed: nothing to cancel/reject, nothing closed to delete. */
function TrashButton({ action, onClick }: { action: TrashAction; onClick: () => void }) {
  if (!action) return <span className="inline-block h-7 w-7" aria-hidden="true" />;
  return (
    <button
      type="button"
      onClick={(event) => {
        stop(event);
        onClick();
      }}
      title={TRASH_LABEL[action]}
      aria-label={TRASH_LABEL[action]}
      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md p-1.5"
    >
      <Icon d={ICON_PATHS.trash} className="h-4 w-4" />
    </button>
  );
}

function OrderTableRow({ item, method, backHref }: { item: StaffOrderListItem; method: PaymentMethod; backHref: string }) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const href = detailHref(method, item.orderNumber, backHref);
  const trash = trashActionForTab(item.control.tab);

  return (
    <tr
      onClick={() => router.push(href)}
      className={`border-border cursor-pointer border-b last:border-b-0 ${
        item.screenshotToCheck ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-secondary/50"
      }`}
    >
      <td className="text-muted-foreground px-3 py-3.5">{item.serial}</td>
      <td className="relative px-3 py-3.5">
        {item.screenshotToCheck && <AlertDot />}
        <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
          {item.orderNumber}
        </Link>
      </td>
      <td className="text-muted-foreground px-3 py-3.5 whitespace-nowrap">
        {item.placedDate}
        <span className="ml-1.5">{item.placedTime}</span>
      </td>
      <td className="px-3 py-3.5">{item.customerName}</td>
      <td className="px-3 py-3.5" onClick={stop}>
        <StatusMenu control={item.control} setOpenDialog={setOpenDialog} />
        <OrderDialogs orderNumber={item.orderNumber} control={item.control} openDialog={openDialog} onClose={() => setOpenDialog(null)} />
      </td>
      <td className="px-3 py-3.5 font-medium whitespace-nowrap">{item.total}</td>
      <td className="px-3 py-3.5" onClick={stop}>
        <TrashButton action={trash} onClick={() => setOpenDialog(trash === "delete" ? "delete" : "close")} />
      </td>
    </tr>
  );
}

function OrderCard({ item, method, backHref }: { item: StaffOrderListItem; method: PaymentMethod; backHref: string }) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const href = detailHref(method, item.orderNumber, backHref);
  const trash = trashActionForTab(item.control.tab);

  return (
    <li onClick={() => router.push(href)} className="bg-card border-border relative cursor-pointer rounded-lg border p-3.5">
      {item.screenshotToCheck && <AlertDot />}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
            {item.orderNumber}
          </Link>
          <p className="mt-0.5 truncate text-sm">{item.customerName}</p>
          <p className="text-muted-foreground text-xs">
            {item.placedDate} · {item.placedTime}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={stop}>
          <TrashButton action={trash} onClick={() => setOpenDialog(trash === "delete" ? "delete" : "close")} />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between" onClick={stop}>
        <StatusMenu control={item.control} setOpenDialog={setOpenDialog} />
        <span className="font-medium">{item.total}</span>
      </div>
      <OrderDialogs orderNumber={item.orderNumber} control={item.control} openDialog={openDialog} onClose={() => setOpenDialog(null)} />
    </li>
  );
}

export function OrdersTable({
  items,
  method,
  backHref,
}: {
  items: StaffOrderListItem[];
  method: PaymentMethod;
  backHref: string;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No orders here.</p>;
  }

  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="rounded-l-lg px-3 py-2.5 font-medium">S.N</th>
                <th className="px-3 py-2.5 font-medium">Order</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Customer</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Total</th>
                <th className="rounded-r-lg px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:pt-5">
              {items.map((item) => (
                <OrderTableRow key={item.orderNumber} item={item} method={method} backHref={backHref} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map((item) => (
          <OrderCard key={item.orderNumber} item={item} method={method} backHref={backHref} />
        ))}
      </ul>
    </>
  );
}
