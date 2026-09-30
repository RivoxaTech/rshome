import Link from "next/link";
import { ordersPath, type OrderTab } from "@/features/orders/transitions";
import type { PaymentMethod } from "@/features/orders/status";

/** Page numbers with "…" where pages are skipped: always the ends, and a window around the current page. */
function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const wanted = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const result: (number | "…")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push("…");
    result.push(page);
    previous = page;
  }
  return result;
}

export function Pagination({
  method,
  tab,
  q,
  page,
  pageCount,
  total,
  pageSize,
}: {
  method: PaymentMethod;
  tab: OrderTab | "all";
  q?: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  if (total === 0) return null;
  const pageHref = (target: number) => ordersPath(method, tab, { q, page: target, pageSize });
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const linkClass = "rounded-md px-2.5 py-1.5 hover:bg-secondary";
  const disabledClass = "text-muted-foreground/50 px-2.5 py-1.5";

  return (
    <div className="flex flex-col-reverse items-start gap-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-x-4">
      <p className="text-muted-foreground">
        Showing {start}–{end} of {total}
      </p>
      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} rel="prev" className={linkClass}>
              ← Previous
            </Link>
          ) : (
            <span className={disabledClass}>← Previous</span>
          )}
          {pageList(page, pageCount).map((entry, index) =>
            entry === "…" ? (
              <span key={`gap-${index}`} className="text-muted-foreground/70 px-1">
                …
              </span>
            ) : (
              <Link
                key={entry}
                href={pageHref(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={`min-w-[2rem] rounded-md px-2 py-1.5 text-center ${
                  entry === page ? "bg-primary text-primary-foreground font-medium" : "hover:bg-secondary"
                }`}
              >
                {entry}
              </Link>
            ),
          )}
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} rel="next" className={linkClass}>
              Next →
            </Link>
          ) : (
            <span className={disabledClass}>Next →</span>
          )}
        </nav>
      )}
    </div>
  );
}
