import type { ReactNode } from "react";

/** Ported from design-reference/src/components/site.tsx (Section). */
export function Section({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`px-6 py-24 lg:px-10 lg:py-36 ${className}`}>
      <div className="mx-auto max-w-[1400px]">{children}</div>
    </section>
  );
}
