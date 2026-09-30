"use client";

import { useRouter } from "next/navigation";
import { PAGE_SIZE_OPTIONS, ordersPath, type OrderTab } from "@/features/orders/transitions";
import type { PaymentMethod } from "@/features/orders/status";

/** Rows per page (25/50/75/100), beside the search box so it never fights the table for space below. */
export function RowsPerPageSelect({
  method,
  tab,
  q,
  pageSize,
}: {
  method: PaymentMethod;
  tab: OrderTab | "all";
  q?: string;
  pageSize: number;
}) {
  const router = useRouter();

  return (
    <label className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs whitespace-nowrap">
      <span className="hidden sm:inline">Rows</span>
      <select
        value={pageSize}
        onChange={(event) => router.push(ordersPath(method, tab, { q, page: 1, pageSize: Number(event.target.value) }))}
        aria-label="Rows per page"
        className="border-input bg-background text-foreground rounded-md border px-1 py-1 text-xs"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
