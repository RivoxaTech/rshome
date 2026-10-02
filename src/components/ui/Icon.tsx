/** The demo's stroke-icon style (design-reference/src/components/site.tsx): thin outline, no fill. */
export function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const ICON_PATHS = {
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  // Order tracking (S7/S8): a package outline, since there are no customer accounts.
  track: "M12 2L3 7v10l9 5 9-5V7L12 2zM3 7l9 5 9-5M12 12v10",
  cart: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18M16 10a4 4 0 01-8 0",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M18 6L6 18M6 6l12 12",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6",
  chevronDown: "M6 9l6 6 6-6",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  copy: "M9 9h11v11H9zM15 9V4H4v11h5",
  check: "M20 6L9 17l-5-5",
  // Payment screenshot picker (S8): a picture frame with a mountain and sun.
  image: "M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01",
  // Panel (S9): dashboard tiles, bank columns, a banknote, sun/moon, logout, chevrons, a profile ring.
  dashboard: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  bank: "M3 10l9-6 9 6M4 10v9M20 10v9M8 10v9M12 10v9M16 10v9M2 21h20",
  cash: "M3 6h18v12H3zM7 6v12M17 6v12M12 9a3 3 0 100 6 3 3 0 000-6z",
  sun: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M20 13.2A8 8 0 1110.8 4a6.4 6.4 0 009.2 9.2z",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  calendar: "M4 5h16v16H4zM4 9h16M8 3v4M16 3v4",
  // Products nav item (S9b): a package/box outline.
  box: "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10",
  // Panel header bell (S21): a notification bell outline.
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0",
  // Wholesale nav item (S17): a crate/carton outline, for bulk goods.
  wholesale: "M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8M12 13v8M3 8l9 5M21 8l-9 5",
  // Average order value stat card (S16): an upward sparkline.
  trendingUp: "M3 17l6-6 4 4 8-9M15 6h6v6",
  // Categories nav item (S10 phase 1): a price tag outline.
  tag: "M3 11V3h8l10 10-8 8L3 11zM7 7h.01",
  // Upload picker (S10 phase 1): an arrow into a tray.
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  // Featured toggle (S10 phase 2): a five-point star outline.
  star: "M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6L3.3 9.2l6.1-.6z",
  // Archive quick action (S10 phase 2): a storage box with its lid.
  archive: "M3 7h18v3H3zM5 10v10h14V10M9 14h6",
  // Drag handle (S10 phase 2b, /panel/products/arrange): a six-dot grip.
  grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
} as const;

/**
 * The ⋮ "more actions" menu (S9): three filled dots. `ICON_PATHS.menu` rotated 90° drew three
 * vertical bars instead, since it is a hamburger icon — this is a real dot glyph, not a stroke path.
 */
export function MoreVerticalIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
