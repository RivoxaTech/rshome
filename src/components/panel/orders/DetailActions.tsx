"use client";

import { useState } from "react";
import { PanelIcon } from "@/components/panel/icons";
import { Menu } from "@/components/panel/Menu";
import { BUTTON, ICON_BUTTON } from "@/components/panel/ui";
import type { OrderControl } from "@/features/orders/staff-service";
import type { StatusAction } from "@/features/orders/transitions";
import { ActionDialog } from "./ActionDialog";

const PRIMARY_LABELS: Partial<Record<StatusAction, string>> = {
  approve: "Approve order",
  ship: "Mark as delivery",
  complete: "Mark completed",
};

/**
 * The detail page's actions (C21): the one main button for the stage and a ⋮ menu with Cancel
 * and Reject order, opening the same dialogs as the list. A screenshot to check has its own card
 * on the page, so it is not repeated here.
 */
export function DetailActions({ control, hideApprove }: { control: OrderControl; hideApprove: boolean }) {
  const [open, setOpen] = useState<StatusAction | null>(null);
  const primary = control.actions.find(({ action }) => PRIMARY_LABELS[action] && !(action === "approve" && hideApprove))?.action;
  const closable = control.actions.some(({ action }) => action === "cancel");
  if (!primary && !closable) return null;

  return (
    <div className="flex items-center gap-2">
      {primary && (
        <button type="button" onClick={() => setOpen(primary)} className={`${BUTTON.primary} flex-1 sm:flex-none`}>
          {PRIMARY_LABELS[primary]}
        </button>
      )}
      {closable && (
        <Menu
          label="More actions"
          align="end"
          entries={[
            { key: "cancel", label: "Cancel order", danger: true, onSelect: () => setOpen("cancel") },
            { key: "reject", label: "Reject order", danger: true, onSelect: () => setOpen("reject") },
          ]}
          trigger={(props) => (
            <button type="button" {...props} aria-label="More actions" className={`${ICON_BUTTON} border-border bg-card border`}>
              <PanelIcon name="more" className="size-[18px]" />
            </button>
          )}
        />
      )}
      {open && <ActionDialog action={open} control={control} onClose={() => setOpen(null)} />}
    </div>
  );
}
