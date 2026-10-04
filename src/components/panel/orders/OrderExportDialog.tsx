"use client";

import { useState } from "react";
import { Dialog } from "@/components/panel/Dialog";
import { Field, inputClass } from "@/components/panel/FormField";
import { Listbox, type ListboxItem } from "@/components/panel/Listbox";
import type { PaymentMethod } from "@/features/orders/status";
import { KARACHI_OFFSET_MS } from "@/lib/karachi-datetime";
import { TAB_INFO, tabsFor, type OrderTab } from "@/features/orders/transitions";

/** Today minus `daysAgo` as a Karachi calendar date — the server reads these as Karachi days too (S22 BUG-16). */
function defaultDate(daysAgo: number): string {
  return new Date(Date.now() + KARACHI_OFFSET_MS - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The orders list's "Export" button (S18), on the tabs row next to the status tabs (matching the
 * wholesale list's own Export button): a small dialog for the date range (defaulting to the last
 * 30 days) and the status tab (defaulting to the page's current one), then a plain navigation to
 * the export route — no `<form>` here, just a link built from this state.
 */
export function OrderExportDialog({ method, currentTab }: { method: PaymentMethod; currentTab: OrderTab | "all" }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => defaultDate(29));
  const [to, setTo] = useState(() => defaultDate(0));
  const [tab, setTab] = useState<OrderTab | "all">(currentTab);

  const tabItems: ListboxItem[] = [
    { value: "all", label: "All statuses" },
    ...tabsFor(method).map((t) => ({ value: t, label: TAB_INFO[t].label })),
  ];

  const href = `/api/panel/orders/export?method=${method}&tab=${tab}&from=${from}&to=${to}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-input hover:bg-secondary shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap"
      >
        Export
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Export orders to CSV">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field id="export-from" label="From">
              <input id="export-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </Field>
            <Field id="export-to" label="To">
              <input id="export-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field id="export-tab" label="Status">
            <Listbox id="export-tab" value={tab} items={tabItems} onChange={(value) => setTab(value as OrderTab | "all")} ariaLabel="Status" />
          </Field>
          <p className="text-muted-foreground text-xs">Capped at the first 5,000 matching orders.</p>
          <a
            href={href}
            onClick={() => setOpen(false)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 self-start rounded-lg px-4 py-2 text-sm font-medium"
          >
            Download CSV
          </a>
        </div>
      </Dialog>
    </>
  );
}
