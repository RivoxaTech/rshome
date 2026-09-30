"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { PanelIcon } from "./icons";
import { ICON_BUTTON } from "./ui";

export const DIALOG_BODY = "grid max-h-[65dvh] gap-4 overflow-y-auto px-4 py-4 sm:px-5";
export const DIALOG_FOOTER = "border-border flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-5";

/**
 * A modal dialog on the native `<dialog>` (focus kept inside, Esc closes). Mounted only while
 * open; Esc, the close button or a click on the backdrop call `onClose`.
 */
export function Dialog({
  title,
  description,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Opened once on mount; Strict Mode's second mount finds it open already.
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      // A dialog opened from a table cell still inherits its text styles, so they are reset here.
      className={`bg-card text-card-foreground border-border m-auto w-[calc(100vw-2rem)] rounded-xl border p-0 text-left font-normal whitespace-normal shadow-2xl backdrop:bg-black/50 ${
        wide ? "max-w-3xl" : "max-w-lg"
      }`}
    >
      <div className="border-border flex items-start justify-between gap-3 border-b py-3 pr-2 pl-4 sm:pl-5">
        <div className="min-w-0 pt-1.5">
          <h2 id={titleId} className="text-base">
            {title}
          </h2>
          {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
        </div>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className={ICON_BUTTON}>
          <PanelIcon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
