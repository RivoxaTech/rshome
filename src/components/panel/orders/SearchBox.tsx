"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { ordersPath, type OrderTab } from "@/features/orders/transitions";
import type { PaymentMethod } from "@/features/orders/status";

/** Order number, name or phone, 300 ms after the last keystroke, in the URL (C21). */
export function SearchBox({
  method,
  tab,
  initialQ,
  pageSize,
}: {
  method: PaymentMethod;
  tab: OrderTab | "all";
  initialQ: string;
  pageSize: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQ);
  // Adjusting state during render (not an effect) when the URL's own q changes underneath us,
  // e.g. the back button: react.dev/learn/you-might-not-need-an-effect#adjusting-state-based-on-props.
  const [syncedQ, setSyncedQ] = useState(initialQ);
  if (initialQ !== syncedQ) {
    setSyncedQ(initialQ);
    setValue(initialQ);
  }

  useEffect(() => {
    if (value === initialQ) return;
    const timer = setTimeout(() => {
      router.replace(ordersPath(method, tab, { q: value || undefined, pageSize }), { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="border-input bg-background focus-within:ring-ring flex items-center gap-1.5 rounded-lg border px-2 py-1 focus-within:ring-2 sm:gap-2 sm:px-3 sm:py-1.5">
      <Icon d={ICON_PATHS.search} className="text-muted-foreground h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search orders"
        aria-label="Search orders"
        maxLength={100}
        className="w-full min-w-0 bg-transparent text-xs outline-none sm:text-sm"
      />
    </div>
  );
}
