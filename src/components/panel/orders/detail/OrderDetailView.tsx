"use client";

import { useState } from "react";
import Link from "next/link";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { OrderDialogs } from "@/components/panel/orders/OrderDialogs";
import { TAB_COLORS, PAYMENT_STATUS_COLORS } from "@/components/panel/orders/tab-colors";
import type { OpenDialog } from "@/components/panel/orders/types";
import { ActivityCard } from "@/components/panel/orders/detail/ActivityCard";
import { CustomerCard } from "@/components/panel/orders/detail/CustomerCard";
import { DeliveryCard } from "@/components/panel/orders/detail/DeliveryCard";
import { ItemsCard } from "@/components/panel/orders/detail/ItemsCard";
import { OrderPrimaryActions } from "@/components/panel/orders/detail/OrderPrimaryActions";
import { PaymentSummaryCard } from "@/components/panel/orders/detail/PaymentSummaryCard";
import { ScreenshotsCard } from "@/components/panel/orders/detail/ScreenshotsCard";
import { TopAlertCard } from "@/components/panel/orders/detail/TopAlertCard";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { StaffOrderView } from "@/features/orders/staff-service";
import { METHOD_PAGES } from "@/features/orders/transitions";

/** The slip/print button only appears once there's something worth packing to print: Processing onward, never Need review/Pending delivery charge (and never a closed order). */
const PRINTABLE_TABS: ReadonlySet<string> = new Set(["processing", "delivery", "completed"]);

export function OrderDetailView({ order, backHref }: { order: StaffOrderView; backHref: string }) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [approveStartsRejecting, setApproveStartsRejecting] = useState(false);
  const { control } = order;
  const statusColors = TAB_COLORS[control.tab];
  const paymentColors = PAYMENT_STATUS_COLORS[order.paymentStatus];
  // "Screenshot to check" (proof_submitted) is already surfaced by the Check-screenshot primary
  // action below — showing it again as a pill here is redundant, unlike every other payment status.
  const showPaymentPill = order.paymentStatus !== "proof_submitted";
  const showPrintButton = PRINTABLE_TABS.has(control.tab);

  const openDialogFresh = (next: OpenDialog) => {
    setApproveStartsRejecting(false);
    setOpenDialog(next);
  };

  return (
    <>
      {/* The header's own title bar shows only the breadcrumb; the page below has the title once. */}
      <PanelPageTitle title={`${METHOD_PAGES[order.paymentMethod].title} / ${order.orderNumber}`} />

      <div className="flex flex-col gap-1.5">
        {/* The order number and the actions always share this one row, at every width: the title
            truncates with an ellipsis instead of wrapping (it never needs to — the full number is
            also in the breadcrumb above and the URL), so the actions never get pushed onto their
            own line by a long title. The status/payment pills render twice on purpose — inline
            here (room for them from `sm` up) and on their own row below (narrower than `sm`) —
            rather than one reflowing copy, which is what let a pill drag the actions down with it
            before. */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <Link
              href={backHref}
              aria-label="Back to the orders list"
              className="text-muted-foreground hover:bg-secondary hover:text-foreground -ml-1 shrink-0 rounded-md p-1 sm:-ml-1.5 sm:p-1.5"
            >
              <Icon d={ICON_PATHS.chevronLeft} className="h-4 w-4" />
            </Link>
            <h1 className="min-w-0 truncate text-sm font-semibold sm:text-base">
              <span className="hidden sm:inline">Order </span>
              {order.orderNumber}
            </h1>
            <span className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${statusColors.bg} ${statusColors.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusColors.dot}`} />
              {control.statusLabel}
            </span>
            {showPaymentPill && (
              <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block ${paymentColors.bg} ${paymentColors.text}`}>
                {order.paymentStatusLabel}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            {showPrintButton && (
              <Link
                href={`/panel/orders/${order.orderNumber}/slip?autoprint=1`}
                target="_blank"
                aria-label="Print slip"
                className="border-input hover:bg-secondary hidden h-9 shrink-0 items-center gap-1.5 rounded-lg border px-4 text-sm font-medium whitespace-nowrap sm:flex"
              >
                <Icon d={ICON_PATHS.printer} className="h-4 w-4 shrink-0" />
                Print slip
              </Link>
            )}
            <OrderPrimaryActions control={control} setOpenDialog={openDialogFresh} />
          </div>
        </div>
        {/* Below `sm`, the pills and the (icon-only) print-slip shortcut move to their own row,
            freeing the title row for just the order number and the primary action/⋮ — the title
            row's only two members then, so the order number never has to compete for width and
            truncate. */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors.bg} ${statusColors.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusColors.dot}`} />
              {control.statusLabel}
            </span>
            {showPaymentPill && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paymentColors.bg} ${paymentColors.text}`}>{order.paymentStatusLabel}</span>
            )}
          </div>
          {showPrintButton && (
            <Link
              href={`/panel/orders/${order.orderNumber}/slip?autoprint=1`}
              target="_blank"
              aria-label="Print slip"
              className="border-input hover:bg-secondary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
            >
              <Icon d={ICON_PATHS.printer} className="h-4 w-4 shrink-0" />
            </Link>
          )}
        </div>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <Icon d={ICON_PATHS.calendar} className="h-3.5 w-3.5" />
          Placed {order.placedAt}
        </span>
      </div>

      {/*
        Two column groups, not three grid rows (S17 follow-up fix): Customer and Activity live
        together in ONE wrapper that is `display: contents` on phones (so its children stack
        individually, orderable) and a real flex column at `lg` (so they sit flush against each
        other with just their own `gap-4`). The original version placed Customer at (col 3, row 1)
        and Activity at (col 3, row 2) as separate grid items — but since row 1 also holds the left
        column (Items, screenshots, delivery, totals, which grows with the item/screenshot count),
        the grid made row 1 as tall as the left column, and Customer's own cell stretched to fill
        it, leaving a blank gap between Customer and Activity that grew with the left column's
        height. Order classes give the phone sequence (Customer first, then the left group, then
        Activity last) independently of this desktop grouping.
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
        <div className="order-2 flex flex-col gap-4 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <ItemsCard items={order.items} />
          <TopAlertCard
            control={control}
            customerWait={order.customerWait}
            whatsApp={order.whatsApp}
            onDone={() => setOpenDialog(null)}
            onRejectScreenshot={() => {
              setApproveStartsRejecting(true);
              setOpenDialog("approve");
            }}
          />
          <ScreenshotsCard proofs={order.proofs} isCod={control.isCod} />
          <DeliveryCard delivery={order.delivery} />
          <PaymentSummaryCard totals={order.totals} isCod={control.isCod} />
        </div>

        <div className="contents lg:col-start-3 lg:row-start-1 lg:flex lg:flex-col lg:gap-4">
          <div className="order-1 lg:order-none">
            <CustomerCard customer={order.customer} address={order.address} customerNote={order.customerNote} whatsApp={order.whatsApp} />
          </div>
          <div className="order-3 lg:order-none">
            <ActivityCard orderNumber={order.orderNumber} history={order.history} canAddNote={order.canAddNote} />
          </div>
        </div>
      </div>

      <OrderDialogs
        orderNumber={order.orderNumber}
        control={control}
        openDialog={openDialog}
        approveStartsRejecting={approveStartsRejecting}
        onClose={() => setOpenDialog(null)}
      />
    </>
  );
}
