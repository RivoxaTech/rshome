"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { buildListPath } from "@/components/panel/list-path";

/** A debounced (300 ms) search box whose URL is built from plain props, shared by the orders and wholesale lists. */
export function SearchBox({
  initialQ,
  basePath,
  tabSlug,
  category,
  pageSize,
  defaultPageSize,
  placeholder = "Search",
  ariaLabel = "Search",
}: {
  initialQ: string;
  basePath: string;
  tabSlug?: string;
  category?: string;
  pageSize: number;
  defaultPageSize: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQ);
  // The last query this box itself put in the URL. When the server answers with it, the box keeps
  // whatever the user has typed since; only a change from elsewhere (the back button) replaces
  // the field. Without this, every round trip overwrote the keystrokes made while it was in
  // flight (S22 BUG-08).
  const [pushedQ, setPushedQ] = useState(initialQ);
  // Adjusting state during render (not an effect) when the URL's own q changes underneath us:
  // react.dev/learn/you-might-not-need-an-effect#adjusting-state-based-on-props.
  const [syncedQ, setSyncedQ] = useState(initialQ);
  if (initialQ !== syncedQ) {
    setSyncedQ(initialQ);
    if (initialQ !== pushedQ) {
      setPushedQ(initialQ);
      setValue(initialQ);
    }
  }

  useEffect(() => {
    if (value === initialQ) return;
    const timer = setTimeout(() => {
      setPushedQ(value);
      router.replace(buildListPath(basePath, tabSlug, { q: value || undefined, category, pageSize }, defaultPageSize), { scroll: false });
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
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={100}
        className="w-full min-w-0 bg-transparent text-xs outline-none sm:text-sm"
      />
    </div>
  );
}
