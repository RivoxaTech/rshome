"use client";

import { useRouter } from "next/navigation";
import { buildListPath } from "@/components/panel/list-path";
import { Listbox, type ListboxItem } from "@/components/panel/Listbox";
import { type ProductTab } from "@/features/catalog/schemas";
import { DEFAULT_PAGE_SIZE } from "@/features/shared/pagination";

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
  const items: ListboxItem[] = [{ value: "", label: "All categories" }, ...options.map((option) => ({ value: String(option.id), label: option.name }))];

  return (
    <Listbox
      value={category ? String(category) : ""}
      items={items}
      ariaLabel="Filter by category"
      onChange={(value) => router.push(buildListPath("/panel/products", tab === "all" ? undefined : tab, { q, category: value || undefined, page: 1 }, DEFAULT_PAGE_SIZE))}
    />
  );
}
