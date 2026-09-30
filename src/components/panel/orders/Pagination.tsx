import Link from "next/link";
import { PanelIcon } from "@/components/panel/icons";

const STEP = "border-border inline-flex size-10 items-center lg:size-8 justify-center rounded-md border transition-colors";

/** "Showing 21–40 of 45" and previous / next, 20 a page. */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Pages" className="border-border flex items-center justify-between gap-4 border-t px-4 py-2.5">
      <p className="text-muted-foreground text-[13px] tabular-nums">
        {first}–{last} of {total} {total === 1 ? "order" : "orders"}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} aria-label="Previous page" className={`${STEP} hover:bg-muted`}>
              <PanelIcon name="chevronLeft" className="h-4 w-4" />
            </Link>
          ) : (
            <span aria-hidden="true" className={`${STEP} opacity-40`}>
              <PanelIcon name="chevronLeft" className="h-4 w-4" />
            </span>
          )}
          <span className="text-muted-foreground px-1 text-[13px] tabular-nums">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} aria-label="Next page" className={`${STEP} hover:bg-muted`}>
              <PanelIcon name="chevronRight" className="h-4 w-4" />
            </Link>
          ) : (
            <span aria-hidden="true" className={`${STEP} opacity-40`}>
              <PanelIcon name="chevronRight" className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
