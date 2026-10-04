"use client";

import { useEffect, useState } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { WhatsAppButton } from "./WhatsAppButton";

/** Scrolled further than this, the back-to-top button appears. */
const SHOW_AFTER_PX = 400;

/**
 * Fixed at the bottom right of every storefront page: the shop's WhatsApp, with back-to-top
 * above it once the page is scrolled. Sits below the header (z-50) and the cart drawer (z-60),
 * whose backdrop covers it, and keeps off the phone's home-indicator area (safe-area insets).
 */
export function FloatingActions({ whatsappHref }: { whatsappHref: string }) {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      data-modal-shell
      className="fixed right-[calc(1rem_+_env(safe-area-inset-right))] bottom-[calc(1rem_+_env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-3 lg:right-6 lg:bottom-6"
    >
      <button
        type="button"
        aria-label="Back to top"
        aria-hidden={!showTop}
        tabIndex={showTop ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
        className={`bg-background border-espresso/20 hover:border-espresso flex h-11 w-11 items-center justify-center rounded-full border shadow-[var(--shadow-soft)] transition-all duration-500 ${
          showTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <Icon d={ICON_PATHS.arrowUp} className="h-4 w-4" />
      </button>
      <WhatsAppButton href={whatsappHref} label="Chat with us on WhatsApp" />
    </div>
  );
}
