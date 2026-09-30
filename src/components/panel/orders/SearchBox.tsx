"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PanelIcon } from "@/components/panel/icons";
import { INPUT } from "@/components/panel/ui";

const DEBOUNCE_MS = 300;

/**
 * The list's only filter (C21): order number, phone or name. Typing updates `?q=` after a 300 ms
 * pause, on the same tab and back to page 1; Enter submits the form, which also works without
 * JavaScript.
 */
export function SearchBox({ action, tab, value }: { action: string; tab: string | null; value: string }) {
  const router = useRouter();
  const [text, setText] = useState(value);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (tab) params.set("tab", tab);
      if (text.trim()) params.set("q", text.trim());
      const search = params.toString();
      router.replace(search ? `${action}?${search}` : action, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, action, tab, router]);

  return (
    <form action={action} role="search" className="relative w-full sm:max-w-xs">
      {tab && <input type="hidden" name="tab" value={tab} />}
      <label className="sr-only" htmlFor="order-search">
        Search orders
      </label>
      <PanelIcon name="search" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <input
        id="order-search"
        type="search"
        name="q"
        value={text}
        onChange={(event) => {
          typed.current = true;
          setText(event.target.value);
        }}
        placeholder="Search order number, phone or name"
        className={`${INPUT} pl-9`}
      />
    </form>
  );
}
