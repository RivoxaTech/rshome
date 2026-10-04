"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { changeWholesaleStatusAction } from "@/app/panel/(protected)/wholesale/actions";
import { usePanelOverlayRoot } from "@/components/panel/overlay-root";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { InquiryControl } from "@/features/wholesale/staff-service";
import { STATUS_COLORS, STATUS_LABELS, type WholesaleStatus } from "@/features/wholesale/transitions";

const MENU_WIDTH = 192;

type Position = { top: number; left: number };

/**
 * The status pill (S17): a popover of the two statuses that aren't the current one, submitting
 * directly on choice — unlike the orders list, a status change needs no reason or extra field, so
 * there's no dialog step. Portalled to the panel overlay root and positioned from the trigger's own rect,
 * same as the orders list's `StatusMenu`, for the same reason: a table wrapped in
 * `overflow-x-auto` clips an absolutely positioned popover on the other axis. Read-only (a plain
 * pill, no button) without `wholesale.manage` or once an inquiry has no other status to offer.
 */
export function StatusMenu({ id, control, onChanged }: { id: number; control: InquiryControl; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const { state, formAction, pending } = useStaffAction(changeWholesaleStatusAction, () => onChanged?.());
  const root = usePanelOverlayRoot();

  const rows = control.options;
  const colors = STATUS_COLORS[control.status];

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = rows.length * 36 + 32;
      const openUpward = window.innerHeight - rect.bottom < menuHeight;
      const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
      setPosition({ top: openUpward ? rect.top - menuHeight - 6 : rect.bottom + 6, left: Math.max(8, left) });
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

  function choose(status: WholesaleStatus) {
    setOpen(false);
    // Set the hidden input directly: `useActionState`'s `formData` reads the DOM at submit time,
    // and a `setState` here wouldn't commit before `requestSubmit()` runs in the same tick.
    if (statusInputRef.current) statusInputRef.current.value = status;
    formRef.current?.requestSubmit();
  }

  function onKeyDown(event: React.KeyboardEvent) {
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
      const status = rows[focusIndex];
      if (status) choose(status);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" ref={statusInputRef} defaultValue="" />
      </form>

      {rows.length === 0 ? (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {control.statusLabel}
        </span>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          disabled={pending}
          onClick={() => {
            setFocusIndex(0);
            setOpen((value) => !value);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-60 ${colors.bg} ${colors.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {control.statusLabel}
          <Icon d={ICON_PATHS.chevronDown} className="h-3 w-3" />
        </button>
      )}
      {state?.ok === false && <span role="alert" className="text-destructive text-[11px]">{state.error}</span>}

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
            <p className="text-muted-foreground px-3 pt-1 pb-1.5 text-[11px]">Change status to</p>
            {rows.map((status, index) => (
              <button
                key={status}
                role="menuitem"
                type="button"
                onClick={() => choose(status)}
                onMouseEnter={() => setFocusIndex(index)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left ${focusIndex === index ? "bg-secondary" : "hover:bg-secondary"}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLORS[status].dot}`} />
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>,
          root,
        )}
    </div>
  );
}
