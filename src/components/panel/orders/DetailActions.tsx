"use client";

import { useEffect, useRef, useState } from "react";
import { PanelIcon } from "@/components/panel/icons";
import { BUTTON, ICON_BUTTON } from "@/components/panel/ui";
import type { OrderControl } from "@/features/orders/staff-service";
import type { StatusAction } from "@/features/orders/transitions";
import { ActionDialog } from "./ActionDialog";

const PRIMARY_LABELS: Partial<Record<StatusAction, string>> = {
  approve: "Approve order",
  check_delivery: "Check delivery charge",
  ship: "Mark as delivery",
  complete: "Mark completed",
};

/**
 * The detail page's actions (C21): the one main button for the stage and a ⋮ menu with Cancel
 * and Reject order, opening the same dialogs as the list.
 */
export function DetailActions({ control }: { control: OrderControl }) {
  const [open, setOpen] = useState<StatusAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const primary = control.actions.find(({ action }) => PRIMARY_LABELS[action])?.action;
  const closable = control.actions.some(({ action }) => action === "cancel");

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  if (!primary && !closable) return null;

  const choose = (action: StatusAction) => {
    setMenuOpen(false);
    setOpen(action);
  };

  return (
    <div className="flex items-center gap-2">
      {primary && (
        <button type="button" onClick={() => setOpen(primary)} className={`${BUTTON.primary} flex-1 sm:flex-none`}>
          {PRIMARY_LABELS[primary]}
        </button>
      )}
      {closable && (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`${ICON_BUTTON} border-border bg-card border`}
          >
            <PanelIcon name="more" />
          </button>
          {menuOpen && (
            <div role="menu" className="bg-popover text-popover-foreground border-border absolute right-0 z-20 mt-2 w-48 rounded-lg border p-1 shadow-lg">
              {(["cancel", "reject"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  onClick={() => choose(action)}
                  className="hover:bg-muted text-status-rejected-foreground flex min-h-10 w-full items-center rounded-md px-3 text-left text-sm font-medium"
                >
                  {action === "cancel" ? "Cancel order" : "Reject order"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {open && <ActionDialog action={open} control={control} onClose={() => setOpen(null)} />}
    </div>
  );
}
