"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { usePanelOverlayRoot } from "@/components/panel/overlay-root";
import { ACTION_LABELS } from "@/components/panel/orders/action-labels";
import { TAB_COLORS } from "@/components/panel/orders/tab-colors";
import type { OpenDialog } from "@/components/panel/orders/types";
import type { OrderControl } from "@/features/orders/staff-service";
import type { StatusAction, OrderTab } from "@/features/orders/transitions";

const MENU_WIDTH = 224; // w-56

/** Shorter wording for this pill only — `control.statusLabel` itself stays unabbreviated where there's room (the detail page's own header pill). */
const PILL_LABELS: Partial<Record<OrderTab, string>> = { pending_delivery: "Pending DC" };

type Position = { top: number; left: number; openUpward: boolean };

/**
 * The coloured status pill (C21/C22): a popover of the next allowed statuses, never the current
 * or an earlier one, then Cancel/Reject below a divider; choosing one opens a dialog. Portalled to
 * the panel overlay root and positioned in fixed coordinates from the trigger's own rect (not CSS
 * `absolute` inside the table): the desktop table sits in an `overflow-x-auto` wrapper, and once one
 * axis of `overflow` is scrollable the browser clips the *other* axis too, so an absolutely
 * positioned popover a few rows down would get cut off instead of floating over the page.
 */
export function StatusMenu({
  control,
  setOpenDialog,
}: {
  control: OrderControl;
  setOpenDialog: (next: OpenDialog) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const root = usePanelOverlayRoot();

  const forward = control.actions.filter((item) => item.action !== "cancel" && item.action !== "reject");
  const closing = control.actions.filter((item) => item.action === "cancel" || item.action === "reject");
  const rows = [...forward, ...closing];

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = rows.length * 40 + 80;
      const openUpward = window.innerHeight - rect.bottom < menuHeight;
      const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
      setPosition({ top: openUpward ? rect.top - menuHeight - 6 : rect.bottom + 6, left: Math.max(8, left), openUpward });
    };
    updatePosition();

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (action: StatusAction) => {
    // Focus the pill before the dialog mounts: the dialog remembers the active element as its
    // opener and returns focus there on close, and the menu row is about to disappear.
    triggerRef.current?.focus();
    setOpen(false);
    setOpenDialog(action);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusIndex((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const row = rows[focusIndex];
      if (row) choose(row.action);
    }
  };

  const colors = TAB_COLORS[control.tab];
  const label = PILL_LABELS[control.tab] ?? control.statusLabel;

  if (rows.length === 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
        {label}
      </span>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setFocusIndex(0);
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${colors.bg} ${colors.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
        {label}
        <Icon d={ICON_PATHS.chevronDown} className="h-3 w-3" />
      </button>

      {open &&
        position &&
        root &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onKeyDown={onKeyDown}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="bg-popover border-border shadow-soft fixed z-50 rounded-lg border py-1.5 text-sm"
          >
            {forward.length > 0 && <p className="text-muted-foreground px-3 pt-1 pb-1.5 text-[11px]">Change status to</p>}
            {forward.map((item, index) => (
              <button
                key={item.action}
                role="menuitem"
                type="button"
                onClick={() => choose(item.action)}
                onMouseEnter={() => setFocusIndex(index)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left ${focusIndex === index ? "bg-secondary" : "hover:bg-secondary"}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TAB_COLORS[item.target].dot}`} />
                {ACTION_LABELS[item.action]}
              </button>
            ))}
            {closing.length > 0 && (
              <>
                {forward.length > 0 && <div className="border-border my-1 border-t" />}
                {closing.map((item, index) => {
                  const rowIndex = forward.length + index;
                  return (
                    <button
                      key={item.action}
                      role="menuitem"
                      type="button"
                      onClick={() => choose(item.action)}
                      onMouseEnter={() => setFocusIndex(rowIndex)}
                      className={`text-destructive flex w-full items-center px-3 py-2 text-left ${focusIndex === rowIndex ? "bg-destructive/10" : "hover:bg-destructive/10"}`}
                    >
                      {ACTION_LABELS[item.action]}
                    </button>
                  );
                })}
              </>
            )}
          </div>,
          root,
        )}
    </>
  );
}
