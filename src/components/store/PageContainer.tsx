import type { ReactNode } from "react";

/**
 * Frame for store pages that sit below the fixed announcement bar + header (Header.tsx, about
 * 100px tall) rather than under it like the home hero. One place for that top offset, so every
 * page heading lands at the same height. When the announcement bar is hidden (blank text in
 * settings, S14) the store layout sets `data-announcement="off"` on its shell and the offset
 * shrinks by the bar's height, so the heading doesn't float lower than before.
 */
export function PageContainer({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`px-6 pt-30 pb-24 group-data-[announcement=off]/shell:pt-23 lg:px-10 lg:pt-34 lg:pb-32 lg:group-data-[announcement=off]/shell:pt-26 ${className}`}
    >
      <div className="mx-auto max-w-[1400px]">{children}</div>
    </div>
  );
}
