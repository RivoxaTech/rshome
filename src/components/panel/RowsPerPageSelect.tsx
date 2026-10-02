"use client";

import { useRouter } from "next/navigation";
import { buildListPath } from "@/components/panel/list-path";

/** Rows per page, beside the search box so it never fights the table for space below. The URL is built from plain props. */
export function RowsPerPageSelect({
  basePath,
  tabSlug,
  q,
  category,
  pageSize,
  options,
  defaultPageSize,
}: {
  basePath: string;
  tabSlug?: string;
  q?: string;
  category?: string;
  pageSize: number;
  options: readonly number[];
  defaultPageSize: number;
}) {
  const router = useRouter();

  return (
    <label className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs whitespace-nowrap">
      <span className="hidden sm:inline">Rows</span>
      <select
        value={pageSize}
        onChange={(event) =>
          router.push(buildListPath(basePath, tabSlug, { q, category, page: 1, pageSize: Number(event.target.value) }, defaultPageSize))
        }
        aria-label="Rows per page"
        className="border-input bg-background text-foreground rounded-md border px-1 py-1 text-xs"
      >
        {options.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
