"use client";

import { useEffect, useRef } from "react";
import { usePanelUi } from "@/components/panel/PanelUiContext";
import { ordersTabTitle } from "@/lib/tab-title";

const POLL_MS = 45_000;

/**
 * The sidebar badges and the browser tab title, kept live (BUILD_PLAN.md S21): polls
 * `/api/panel/notifications` every 45s, only while the tab is visible, pausing when it's hidden
 * and refreshing the moment it becomes visible again. No websockets or SSE (ARCHITECTURE.md §9).
 * Renders nothing; only present for an `order.view` holder (the caller checks).
 */
export function OrderCountsPoller() {
  const { setCounts } = usePanelUi();
  const baseTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "");

  useEffect(() => {
    const baseTitle = baseTitleRef.current;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/panel/notifications", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const counts = (await response.json()) as Partial<Record<string, number>>;
        if (cancelled) return;
        setCounts(counts);
        const total = (counts["orders-bank"] ?? 0) + (counts["orders-cod"] ?? 0);
        document.title = ordersTabTitle(total) ?? baseTitle;
      } catch {
        // Best effort: try again on the next tick.
      }
    }

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

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.title = baseTitle;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
