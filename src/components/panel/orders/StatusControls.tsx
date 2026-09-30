"use client";

import { useState } from "react";
import { PanelIcon } from "@/components/panel/icons";
import { Menu, type MenuEntry } from "@/components/panel/Menu";
import { DOT_CLASSES, ICON_BUTTON, PILL, Pill, TONE_CLASSES, Tooltip } from "@/components/panel/ui";
import type { OrderControl } from "@/features/orders/staff-service";
import { TAB_INFO, type StatusAction } from "@/features/orders/transitions";
import { ActionDialog } from "./ActionDialog";

const CLOSING: readonly StatusAction[] = ["cancel", "reject"];
/** Widens the pill's tap area to about 44 px high without growing the pill. */
const TAP_AREA = "relative before:absolute before:-inset-y-2.5 before:inset-x-0";

/**
 * The coloured status pill (C21, C22): when staff can move the order on, it opens a menu of only
 * the next statuses under a "Change status to" caption, with Cancelled and Rejected in red below
 * a divider. Choosing one opens that step's dialog; nothing changes until it is confirmed.
 */
export function StatusMenu({ control }: { control: OrderControl }) {
  const [open, setOpen] = useState<StatusAction | null>(null);
  if (control.actions.length === 0) return <Pill tone={control.tab}>{control.statusLabel}</Pill>;

  const entry = ({ action, target }: OrderControl["actions"][number]): MenuEntry => ({
    key: action,
    label: TAB_INFO[target].label,
    dot: DOT_CLASSES[target],
    danger: CLOSING.includes(action),
    onSelect: () => setOpen(action),
  });
  const forward = control.actions.filter(({ action }) => !CLOSING.includes(action)).map(entry);
  const closing = control.actions.filter(({ action }) => CLOSING.includes(action)).map(entry);
  const entries = forward.length > 0 && closing.length > 0 ? [...forward, { divider: "close" }, ...closing] : [...forward, ...closing];

  return (
    <>
      <Menu
        label={`Change the status of ${control.orderNumber} to`}
        caption="Change status to"
        entries={entries}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={`Status of ${control.orderNumber}: ${control.statusLabel}. Change status`}
            className={`${PILL} ${TONE_CLASSES[control.tab]} ${TAP_AREA} cursor-pointer pr-1.5 transition hover:ring-current/40`}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {control.statusLabel}
            <PanelIcon name="chevronDown" className="size-3.5" />
          </button>
        )}
      />
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
          <PanelIcon name="trash" className="size-[18px]" />
        </button>
      </Tooltip>
      {open && <ActionDialog action="cancel" control={control} onClose={() => setOpen(false)} />}
    </>
  );
}
