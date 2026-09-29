"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { StoreNavItem } from "@/components/store/nav-items";

/** Ported from design-reference/src/components/site.tsx (Header), routed for a multi-page app. */
export function Header({
  logoText,
  announcementText,
  navItems,
  cartCount,
}: {
  logoText: string;
  announcementText: string;
  navItems: StoreNavItem[];
  cartCount: number;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="bg-espresso py-2 text-center text-[10px] tracking-[0.3em] text-background uppercase">
        {announcementText}
      </div>
      <div
        className={`transition-all duration-500 ${
          scrolled
            ? "bg-background/70 border-border border-b shadow-[0_1px_30px_-20px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="font-serif text-xl tracking-[0.35em] uppercase">
            {logoText}
          </Link>

          <nav className="hidden items-center gap-9 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="hover:text-champagne relative text-[11px] tracking-[0.22em] uppercase transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-5">
            <Link href="/shop" aria-label="Shop" className="hover:text-champagne transition-colors">
              <Icon d={ICON_PATHS.search} />
            </Link>
            <Link href="/track" aria-label="Track your order" className="hover:text-champagne transition-colors">
              <Icon d={ICON_PATHS.track} />
            </Link>
            <Link href="/cart" aria-label="Cart" className="hover:text-champagne relative transition-colors">
              <Icon d={ICON_PATHS.cart} />
              {cartCount > 0 && (
                <span className="bg-champagne text-espresso absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px]">
                  {cartCount}
                </span>
              )}
            </Link>
            <button aria-label="Menu" onClick={() => setOpen((v) => !v)} className="lg:hidden">
              <Icon d={ICON_PATHS.menu} />
            </button>
          </div>
        </div>

        {open && (
          <nav className="bg-background/95 border-border grid gap-4 border-t px-6 py-6 backdrop-blur-xl lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-[11px] tracking-[0.22em] uppercase"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
