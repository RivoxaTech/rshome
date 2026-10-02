"use client";

import { useRouter } from "next/navigation";
import { buildListPath } from "@/components/panel/list-path";
import { Listbox } from "@/components/panel/Listbox";

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
    <div className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs whitespace-nowrap">
      <span className="hidden sm:inline">Rows</span>
      <Listbox
        value={String(pageSize)}
        items={options.map((size) => ({ value: String(size), label: String(size) }))}
        ariaLabel="Rows per page"
        className="w-16 text-xs [&_summary]:px-1 [&_summary]:py-1"
        onChange={(value) => router.push(buildListPath(basePath, tabSlug, { q, category, page: 1, pageSize: Number(value) }, defaultPageSize))}
      />
    </div>
  );
}
