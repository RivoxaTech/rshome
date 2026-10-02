"use client";

import { useEffect, useRef } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

/** A centered modal: Esc and an outside click close it, focus lands on the panel when it opens. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  widthClassName = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** A Tailwind max-width class, for a dialog whose content wants more room than the default `max-w-md`. */
  widthClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`bg-card text-foreground border-border shadow-soft relative flex max-h-[85vh] w-full ${widthClassName} flex-col rounded-lg border outline-none`}
      >
        <div className="border-border flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:bg-secondary hover:text-foreground -mr-1.5 rounded-md p-1.5"
          >
            <Icon d={ICON_PATHS.close} className="h-4 w-4" />
          </button>
        </div>
        <div className="thin-scrollbar overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
