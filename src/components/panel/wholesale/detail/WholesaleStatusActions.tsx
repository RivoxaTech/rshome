"use client";

import { useEffect, useRef, useState } from "react";
import { changeWholesaleStatusAction } from "@/app/panel/(protected)/wholesale/actions";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { MoreVerticalIcon } from "@/components/ui/Icon";
import type { InquiryControl } from "@/features/wholesale/staff-service";
import { STATUS_ACTION_LABELS, primaryStatusLabel, primaryStatusTarget, secondaryStatusTargets, type WholesaleStatus } from "@/features/wholesale/transitions";

/**
 * The detail page's header controls (S17 follow-up, mirrors the order detail page's
 * `OrderPrimaryActions`): one primary button for the next step, plus a ⋮ menu for the other
 * status. Submits directly — a status change needs no reason or extra field, so there's no dialog
 * step, same as the status pill. `wholesale.manage` only; a view-only session sees neither (the
 * pill in the title row still shows the plain read-only status for them).
 */
export function WholesaleStatusActions({ id, control, onChanged }: { id: number; control: InquiryControl; onChanged?: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const { state, formAction, pending } = useStaffAction(changeWholesaleStatusAction, () => onChanged?.());

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

  if (!control.canManage) return null;

  function submit(status: WholesaleStatus) {
    setMoreOpen(false);
    // Set the hidden input directly: a `setState` here wouldn't commit before `requestSubmit()`
    // runs in the same tick (see `StatusMenu`).
    if (statusInputRef.current) statusInputRef.current.value = status;
    formRef.current?.requestSubmit();
  }

  const primary = primaryStatusTarget(control.status);
  const others = secondaryStatusTargets(control.status);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" ref={statusInputRef} defaultValue="" />
      </form>

      <button
        type="button"
        disabled={pending}
        onClick={() => submit(primary)}
        className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        {primaryStatusLabel(control.status)}
      </button>

      {others.length > 0 && (
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
              {others.map((status) => (
                <button
                  key={status}
                  role="menuitem"
                  type="button"
                  onClick={() => submit(status)}
                  className="hover:bg-secondary flex w-full items-center px-3 py-2 text-left"
                >
                  {STATUS_ACTION_LABELS[status]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {state?.ok === false && <span className="text-destructive text-xs">{state.error}</span>}
    </div>
  );
}
