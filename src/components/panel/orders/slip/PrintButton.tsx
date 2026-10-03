"use client";

/** A plain click-to-print control (no function props from a server component, CLAUDE.md RSC rule); auto-print is never triggered. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium print:hidden"
    >
      Print
    </button>
  );
}
