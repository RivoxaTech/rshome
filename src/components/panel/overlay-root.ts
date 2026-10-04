"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const getRoot = () => document.getElementById("panel-shell") ?? document.body;
const getServerRoot = () => null;

/**
 * Where the panel's overlays (dialogs, the proof viewer, the status menus, the phone sidebar) are
 * portalled: `#panel-shell` itself, so they keep the panel's Inter font and dark palette (both
 * scoped to that element, theme.css) while sitting outside the frame that `useModal` makes inert.
 * Null on the server and during hydration (portals cannot render there); overlays only open after
 * a click, so the one extra client render is never visible.
 */
export function usePanelOverlayRoot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, getRoot, getServerRoot);
}
