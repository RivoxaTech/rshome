"use client";

import { useRouter } from "next/navigation";
import { buildListPath } from "@/components/panel/list-path";
import { PRODUCT_DEFAULT_PAGE_SIZE, type ProductTab } from "@/features/catalog/schemas";

/** The list's category filter; survives alongside the tab/search/rows-per-page state (list-path.ts). */
export function CategoryFilterSelect({
  tab,
  q,
  category,
  options,
}: {
  tab: ProductTab;
  q?: string;
  category?: number;
  options: { id: number; name: string }[];
}) {
  const router = useRouter();

  return (
    <select
      value={category ?? ""}
      onChange={(event) =>
        router.push(buildListPath("/panel/products", tab === "all" ? undefined : tab, { q, category: event.target.value || undefined, page: 1 }, PRODUCT_DEFAULT_PAGE_SIZE))
      }
      aria-label="Filter by category"
      className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs sm:text-sm"
    >
      <option value="">All categories</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
