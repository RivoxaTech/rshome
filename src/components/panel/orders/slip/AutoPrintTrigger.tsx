"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `window.print()` once, right after the slip has rendered — only for the "Print slip" entry
 * point on the order detail page (`?autoprint=1`), never for a plain visit to the slip's own URL.
 * Renders nothing. The `fired` ref guards against React's dev-only Strict Mode double-invoking
 * this effect (mount → cleanup → mount again, dev builds only) — without it, a local `npm run dev`
 * session opens the print dialog twice; the ref makes it fire exactly once in dev and production.
 */
export function AutoPrintTrigger() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    window.print();
  }, []);

  return null;
}
