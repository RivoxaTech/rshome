"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { usePanelOverlayRoot } from "@/components/panel/overlay-root";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { useModal } from "@/components/ui/use-modal";

/**
 * A centered modal: focus lands on the panel when it opens and stays inside it, Esc and an
 * outside click close it, and focus returns to the opener (`useModal`). Portalled to the panel
 * overlay root so the frame behind it can be `inert`; React events still bubble to the owner.
 */
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
  const root = usePanelOverlayRoot();
  useModal({ ref: panelRef, open: open && root !== null, onClose });

  if (!open || !root) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Not a tab stop: the header's Close button and Esc serve the keyboard. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/50" />
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
    </div>,
    root,
  );
}
