import type { ReactNode } from "react";

/**
 * Frame for store pages that sit below the fixed announcement bar + header (Header.tsx, about
 * 100px tall) rather than under it like the home hero. One place for that top offset, so every
 * page heading lands at the same height.
 */
export function PageContainer({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`px-6 pt-30 pb-24 lg:px-10 lg:pt-34 lg:pb-32 ${className}`}>
      <div className="mx-auto max-w-[1400px]">{children}</div>
    </div>
  );
}
