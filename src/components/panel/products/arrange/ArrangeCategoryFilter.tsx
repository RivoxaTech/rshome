"use client";

import { useRouter } from "next/navigation";
import { Listbox, type ListboxItem } from "@/components/panel/Listbox";

/** The Shop order tab's category filter: arranging within a category leaves every other category's relative order untouched. */
export function ArrangeCategoryFilter({ category, options }: { category?: number; options: { id: number; name: string }[] }) {
  const router = useRouter();
  const items: ListboxItem[] = [{ value: "", label: "All products" }, ...options.map((option) => ({ value: String(option.id), label: option.name }))];

  return (
    <Listbox
      value={category ? String(category) : ""}
      items={items}
      ariaLabel="Filter by category"
      className="w-fit"
      onChange={(value) => {
        const search = new URLSearchParams();
        if (value) search.set("category", value);
        const query = search.toString();
        router.push(query ? `/panel/products/arrange?${query}` : "/panel/products/arrange");
      }}
    />
  );
}
