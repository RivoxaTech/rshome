"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export type MenuEntry = { key: string; label: string; onSelect: () => void; dot?: string; danger?: boolean } | { divider: string };

const GAP = 6;
const EDGE = 8;

/**
 * A popover menu (C22) under its trigger, or above it when there is no room below, always kept on
 * screen. Arrow keys, Home and End move between items, Enter chooses, Esc and Tab close; a tap or
 * click outside, scrolling or resizing closes it too. It is fixed to the viewport, so a table or
 * a scrolling area never clips it. `caption` is a heading, not an item.
 */
export function Menu({
  label,
  caption,
  entries,
  align = "start",
  trigger,
}: {
  label: string;
  caption?: string;
  entries: MenuEntry[];
  align?: "start" | "end";
  trigger: (props: {
    ref: RefObject<HTMLButtonElement | null>;
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
  }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const focusOnOpen = useRef<"first" | "last">("first");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  function close(returnFocus: boolean) {
    setOpen(false);
    setPosition(null);
    if (returnFocus) triggerRef.current?.focus();
  }

  function show(focus: "first" | "last") {
    focusOnOpen.current = focus;
    setOpen(true);
  }

  // Place it before paint: below the trigger, flipped up near the bottom, inside the viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menuRef.current;
    const below = anchor.bottom + GAP;
    const fitsBelow = below + height <= window.innerHeight - EDGE;
    const top = fitsBelow || anchor.top - GAP - height < EDGE ? Math.min(below, window.innerHeight - EDGE - height) : anchor.top - GAP - height;
    const wanted = align === "start" ? anchor.left : anchor.right - width;
    setPosition({ top: Math.max(EDGE, top), left: Math.min(Math.max(EDGE, wanted), window.innerWidth - EDGE - width) });
  }, [open, align]);

  useEffect(() => {
    if (!open || !position) return;
    const list = items();
    (focusOnOpen.current === "first" ? list[0] : list.at(-1))?.focus({ preventScroll: true });
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const moved = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [open]);

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus({ preventScroll: true });
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") close(false);
  }

  function onTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowDown" ? "first" : "last");
    }
  }

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: () => (open ? close(false) : show("first")),
        onKeyDown: onTriggerKey,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? id : undefined,
      })}
      {open && (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: "hidden" }}
          className="bg-popover text-popover-foreground border-border fixed z-50 min-w-48 rounded-lg border p-1 text-left text-[13px] font-normal tracking-normal whitespace-nowrap normal-case shadow-lg"
        >
          {caption && (
            <p aria-hidden="true" className="text-muted-foreground px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide uppercase select-none">
              {caption}
            </p>
          )}
          {entries.map((entry) =>
            "divider" in entry ? (
              <div key={entry.divider} role="separator" className="bg-border mx-1 my-1 h-px" />
            ) : (
              <button
                key={entry.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close(false);
                  entry.onSelect();
                }}
                className={`hover:bg-muted focus-visible:bg-muted flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left font-medium outline-none sm:min-h-8 ${
                  entry.danger ? "text-status-rejected-foreground" : ""
                }`}
              >
                {entry.dot && <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${entry.dot}`} />}
                {entry.label}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
