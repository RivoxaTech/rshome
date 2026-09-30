"use client";

import { useState } from "react";
import { PanelIcon } from "@/components/panel/icons";
import { ICON_BUTTON, Pill, TONE_CLASSES, Tooltip } from "@/components/panel/ui";
import type { OrderControl } from "@/features/orders/staff-service";
import { TAB_INFO, type StatusAction } from "@/features/orders/transitions";
import { ActionDialog } from "./ActionDialog";

/**
 * The coloured status pill of a list row (C21, like the reference's dropdowns): the current status
 * and, when staff can move the order on, only its next statuses. Choosing one opens that step's
 * dialog; nothing changes until the dialog is confirmed.
 */
export function StatusSelect({ control }: { control: OrderControl }) {
  const [open, setOpen] = useState<StatusAction | null>(null);
  const current = TAB_INFO[control.tab].label;
  if (control.actions.length === 0) return <Pill tone={control.tab}>{current}</Pill>;

  return (
    <>
      <span className={`ring-current/15 relative inline-flex items-center rounded-full ring-1 ring-inset transition hover:ring-current/40 ${TONE_CLASSES[control.tab]}`}>
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-1.5 -translate-y-1/2 rounded-full bg-current" />
        <select
          value=""
          onChange={(event) => setOpen(event.target.value as StatusAction)}
          aria-label={`Status of ${control.orderNumber}: ${current}. Choose the next step`}
          className="field-sizing-content min-h-8 cursor-pointer appearance-none rounded-full bg-transparent py-1 pr-7 pl-6 text-xs font-medium whitespace-nowrap"
        >
          <option value="" disabled>
            {current}
          </option>
          <optgroup label="Move to">
            {control.actions.map(({ action, target }) => (
              <option key={action} value={action}>
                {TAB_INFO[target].label}
              </option>
            ))}
          </optgroup>
        </select>
        <PanelIcon name="chevronDown" className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2" />
      </span>
      {open && <ActionDialog action={open} control={control} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The row's trash icon: the same Cancel / Reject dialog, never a hard delete (C21). Only while the order can still be closed. */
export function CloseOrderButton({ control }: { control: OrderControl }) {
  const [open, setOpen] = useState(false);
  if (!control.actions.some(({ action }) => action === "cancel")) return null;
  const label = `Cancel or reject ${control.orderNumber}`;

  return (
    <>
      <Tooltip label="Cancel or reject">
        <button type="button" onClick={() => setOpen(true)} aria-label={label} className={`${ICON_BUTTON} hover:text-status-rejected-foreground hover:bg-status-rejected`}>
          <PanelIcon name="trash" />
        </button>
      </Tooltip>
      {open && <ActionDialog action="cancel" control={control} onClose={() => setOpen(false)} />}
    </>
  );
}
