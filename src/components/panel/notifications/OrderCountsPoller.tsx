"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePanelUi } from "@/components/panel/PanelUiContext";
import { isSoundEnabled, playNotificationSound } from "@/lib/panel-sound";
import { ordersTabTitle } from "@/lib/tab-title";

const POLL_MS = 12_000;

/**
 * Push event types worth a sound (owner choice, S22 follow-up): a brand-new order or wholesale
 * lead, not an existing order's second (delivery-charge) screenshot. "test" is the bell's own
 * "Send test notification" button, so one click proves both push delivery and the chime.
 */
const SOUND_EVENT_TYPES = new Set(["new_order", "new_wholesale_inquiry", "test"]);

/**
 * The counts keys the poll fallback (no push) compares tick to tick to decide a sound is
 * warranted: `wholesale` only ever grows from a genuinely new inquiry, and the `-new` order keys
 * are the raw Need review tab count (`features/orders/staff-service.ts`), not `needsAction` — the
 * latter also grows when an *existing* order's screenshot needs checking, which the owner chose to
 * keep silent.
 */
const SOUND_COUNT_KEYS = ["orders-bank-new", "orders-cod-new", "wholesale"] as const;

/**
 * The sidebar badges, the browser tab title, and a near-real-time nudge (BUILD_PLAN.md S21,
 * extended S22 follow-up): polls `/api/panel/notifications` every 12s while the tab is visible,
 * immediately on mount, and immediately again on every client-side navigation inside the panel —
 * the shared layout that seeds the sidebar's initial counts doesn't re-run on a soft navigation
 * (Next keeps it mounted), so without this the badge can keep showing whatever it was up to one
 * poll ago even after you've opened a tab with a different true count.
 *
 * A push notification, once enabled on this device, additionally triggers (via a message the
 * service worker relays to every open tab) an instant re-poll, a silent `router.refresh()` of
 * whatever page is on screen, and — for a new order or wholesale lead, never a screenshot upload —
 * a notification sound. Without push, the same sound still fires from the count delta the next
 * poll tick observes, just up to `POLL_MS` later. No websockets or SSE (ARCHITECTURE.md §9):
 * Passenger has no persistent process to hold one open, and push's own "always-on connection" is
 * held by the browser vendor's push service, not by this app's server.
 */
export function OrderCountsPoller() {
  const { setCounts } = usePanelUi();
  const pathname = usePathname();
  const router = useRouter();
  const baseTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "");
  const previousCountsRef = useRef<Partial<Record<string, number>> | null>(null);
  const cancelledRef = useRef(false);
  const isFirstPathRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/panel/notifications", { cache: "no-store" });
      if (!response.ok || cancelledRef.current) return;
      const counts = (await response.json()) as Partial<Record<string, number>>;
      if (cancelledRef.current) return;
      setCounts(counts);
      const total = (counts["orders-bank"] ?? 0) + (counts["orders-cod"] ?? 0);
      document.title = ordersTabTitle(total) ?? baseTitleRef.current;

      const previous = previousCountsRef.current;
      if (previous && isSoundEnabled() && SOUND_COUNT_KEYS.some((key) => (counts[key] ?? 0) > (previous[key] ?? 0))) {
        playNotificationSound();
      }
      previousCountsRef.current = counts;
    } catch {
      // Best effort: try again on the next tick.
    }
  }, [setCounts]);

  // Interval + visibility + push-message effect: set up once.
  useEffect(() => {
    const baseTitle = baseTitleRef.current;
    cancelledRef.current = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      poll();
      timer = setInterval(poll, POLL_MS);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    if (document.visibilityState === "visible") start();
    const onVisibilityChange = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onPushMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "rshome-push") return;
      poll();
      router.refresh();
      if (isSoundEnabled() && SOUND_EVENT_TYPES.has(event.data.eventType)) playNotificationSound();
    };
    const hasServiceWorker = "serviceWorker" in navigator;
    if (hasServiceWorker) navigator.serviceWorker.addEventListener("message", onPushMessage);

    return () => {
      cancelledRef.current = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (hasServiceWorker) navigator.serviceWorker.removeEventListener("message", onPushMessage);
      document.title = baseTitle;
    };
  }, [poll, router]);

  // Re-sync the moment staff navigate to a different panel page (see the doc comment above); skip
  // the very first render, since the effect above already polls once on mount. No visibility check
  // here (unlike the interval above, which skips a background tab to save battery/requests) — a
  // client-side navigation cannot happen unless this exact tab was just clicked in, so it's already
  // the one the staff member is looking at.
  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false;
      return;
    }
    poll();
  }, [pathname, poll]);

  return null;
}
