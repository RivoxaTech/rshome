"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { listingHref, type ListingState } from "@/components/store/catalog/listing-href";
import { SHOP_SORTS, type ShopSort } from "@/features/catalog/listing";

const SORT_LABELS: Record<ShopSort, string> = {
  recommended: "Recommended",
  newest: "Newest",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
};

/**
 * A native <details> menu of plain links: it opens and sorts without JavaScript. The effect
 * only adds closing on an outside click or Escape. Each link keeps the search and category and
 * resets to page 1.
 */
export function SortMenu({ basePath, state }: { basePath: string; state: ListingState }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    const onPointerDown = (event: PointerEvent) => {
      if (details.open && !details.contains(event.target as Node)) details.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Client-side navigation keeps this component mounted, so close the menu after a choice.
  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <details ref={detailsRef} className="relative shrink-0">
      <summary className="hover:text-champagne flex cursor-pointer list-none items-center gap-2 py-1 text-[10px] tracking-[0.28em] uppercase transition-colors [&::-webkit-details-marker]:hidden">
        <span>
          <span className="text-muted-foreground">Sort: </span>
          {SORT_LABELS[state.sort]}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-3 w-3" aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <ul className="bg-background border-border shadow-soft absolute top-full right-0 z-20 mt-3 min-w-56 border py-2">
        {SHOP_SORTS.map((sort) => {
          const active = sort === state.sort;
          return (
            <li key={sort}>
              <Link
                href={listingHref(basePath, { ...state, sort, page: 1 })}
                onClick={close}
                aria-current={active ? "true" : undefined}
                className={`hover:bg-espresso/5 flex items-center justify-between gap-4 px-5 py-3 text-[10px] tracking-[0.28em] uppercase transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {SORT_LABELS[sort]}
                {active && <span aria-hidden="true">✓</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
