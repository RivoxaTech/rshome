"use client";

import { useEffect, useRef, useState } from "react";
import { ACTION_LABELS } from "@/components/panel/orders/action-labels";
import { MoreVerticalIcon } from "@/components/ui/Icon";
import type { OpenDialog } from "@/components/panel/orders/types";
import type { OrderControl } from "@/features/orders/staff-service";

/**
 * The detail page's header controls (C21): one primary button for the order's current stage,
 * plus a ⋮ menu with Cancel/Reject — never both shown for a closed or completed order.
 */
export function OrderPrimaryActions({
  control,
  setOpenDialog,
}: {
  control: OrderControl;
  setOpenDialog: (next: OpenDialog) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const primary = control.actions.find((item) => item.action !== "cancel" && item.action !== "reject");
  const closing = control.actions.filter((item) => item.action === "cancel" || item.action === "reject");

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  if (!primary && closing.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      {primary && (
        <button
          type="button"
          onClick={() => setOpenDialog(primary.action)}
          className="bg-primary text-primary-foreground flex h-9 shrink-0 items-center rounded-lg px-2.5 text-xs font-medium whitespace-nowrap hover:opacity-90 sm:px-4 sm:text-sm"
        >
          {ACTION_LABELS[primary.action]}
        </button>
      )}
      {closing.length > 0 && (
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMoreOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="More actions"
            title="More actions"
            className="text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg p-2"
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </button>
          {moreOpen && (
            <div
              ref={menuRef}
              role="menu"
              className="bg-popover border-border shadow-soft absolute top-full right-0 z-20 mt-1.5 w-44 rounded-lg border py-1.5 text-sm"
            >
              {closing.map((item) => (
                <button
                  key={item.action}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setOpenDialog(item.action);
                  }}
                  className="text-destructive hover:bg-destructive/10 flex w-full items-center px-3 py-2 text-left"
                >
                  {ACTION_LABELS[item.action]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
