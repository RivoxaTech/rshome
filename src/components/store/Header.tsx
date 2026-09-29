"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/components/store/cart/CartProvider";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { StoreNavItem } from "@/components/store/nav-items";

/** Ported from design-reference/src/components/site.tsx (Header), routed for a multi-page app. */
export function Header({
  logoText,
  announcementText,
  navItems,
}: {
  logoText: string;
  announcementText: string;
  navItems: StoreNavItem[];
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { itemCount, openDrawer } = useCart();
  // Only the home page sits under a transparent header (over the hero); inner pages get the
  // translucent background and bottom border from the top, and the shadow once scrolled.
  const isHome = usePathname() === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The open mobile menu gets the scrolled look too, so it reads the same over the hero and plain pages.
  const elevated = scrolled || open;
  const separated = elevated || !isHome;

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* One line on phones: smaller type and tracking below sm, the demo's 10px / 0.3em above. */}
      <div className="bg-espresso text-background overflow-hidden px-3 py-2 text-center text-[8px] tracking-[0.12em] whitespace-nowrap uppercase sm:text-[10px] sm:tracking-[0.3em]">
        {announcementText}
      </div>
      <div
        className={`transition-all duration-500 ${
          separated ? "bg-background/70 border-border border-b backdrop-blur-xl" : "bg-transparent"
        } ${elevated ? "shadow-[0_1px_30px_-20px_rgba(0,0,0,0.5)]" : ""}`}
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
            <button type="button" aria-label="Cart" onClick={openDrawer} className="hover:text-champagne relative transition-colors">
              <Icon d={ICON_PATHS.cart} />
              {itemCount > 0 && (
                <span className="bg-champagne text-espresso absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px]">
                  {itemCount}
                </span>
              )}
            </button>
            <button aria-label="Menu" onClick={() => setOpen((v) => !v)} className="lg:hidden">
              <Icon d={ICON_PATHS.menu} />
            </button>
          </div>
        </div>

        {open && (
          // No background of its own: the wrapper's translucent blur covers the header row and this panel.
          <nav className="border-border/60 grid gap-4 border-t px-6 py-6 lg:hidden">
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
