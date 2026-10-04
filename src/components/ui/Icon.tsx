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
  // Categories nav item (S10): a price tag outline.
  tag: "M3 11V3h8l10 10-8 8L3 11zM7 7h.01",
  // Upload picker (S10): an arrow into a tray.
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  // Featured toggle (S10): a five-point star outline.
  star: "M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6L3.3 9.2l6.1-.6z",
  // Archive quick action (S10): a storage box with its lid.
  archive: "M3 7h18v3H3zM5 10v10h14V10M9 14h6",
  // Drag handle (S10, /panel/products/arrange): a six-dot grip.
  grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  // Edit quick action (S10, the variants card): a pencil outline.
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
  // Activate/deactivate toggle (S10, the variants card): a power glyph.
  power: "M12 2v9M18.4 6.6a8 8 0 11-12.8 0",
  // Discounts nav item (S12): a percent sign.
  percent: "M19 5L5 19M7.5 9a2 2 0 100-4 2 2 0 000 4zM16.5 19a2 2 0 100-4 2 2 0 000 4z",
  // Coupons nav item (S13): a ticket with notched sides.
  ticket: "M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4V7zM14 7v10",
  /** The panel's Shipping nav item (S14): a delivery truck. */
  truck:
    "M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2M15 18H9M19 18h2a1 1 0 001-1v-3.65a1 1 0 00-.22-.62l-3.48-4.35A1 1 0 0017.52 8H14M7 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z",
  /** The panel's Settings nav item (S14): a gear. */
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  /** The panel's Bank & contact nav item (S14): a payment card. */
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  // Password show/hide toggle (login + account change-password, S18 polish): an open eye…
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 15a3 3 0 100-6 3 3 0 000 6z",
  // …and the same eye with a strike-through, for "hide".
  eyeOff:
    "M3 3l18 18M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 7 11 7a13.2 13.2 0 01-3.22 3.88M6.1 6.1A13.2 13.2 0 001 11s4 7 11 7a10.9 10.9 0 005.09-1.25M10.6 10.6a3 3 0 104.24 4.24",
  // The order detail page's "Print slip" button (S18 polish): a printer outline.
  printer: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
  // Export buttons' icon-only mobile form (S18 polish): an arrow down into a tray.
  download: "M12 3v12M7 10l5 5 5-5M4 19h16",
  // "New product"'s icon-only mobile form (S18 polish): a plus sign.
  plus: "M12 5v14M5 12h14",
  // "Arrange products"' icon-only mobile form (S18 polish): stacked up/down chevrons — `grip`'s
  // six zero-length dots are too faint to read at a 16px toolbar-icon size (fine at the larger
  // drag-handle size it was designed for).
  reorder: "M7 10l5-5 5 5M7 14l5 5 5-5",
  // Users nav item (S20): two people outlines.
  users: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  // Roles nav item (S20): a shield with a tick.
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  // Audit log nav item (S20): a clipboard with lines.
  clipboard: "M9 4h6v3H9zM9 4H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 12h6M9 16h6",
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

/**
 * Contact page social icons (S19 polish): stroke style matching this file's icon family (not
 * `WhatsAppGlyph`'s filled brand mark, which the contact page reuses as-is) — a rounded frame, lens
 * and flash dot, the same shape every major icon set uses for Instagram.
 */
export function InstagramGlyph({ className = "h-[18px] w-[18px]" }: { className?: string }) {
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
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
      <path d="M17.5 6.5h.01" />
    </svg>
  );
}

/** Contact page social icons (S19 polish): the same ribbon outline most stroke icon sets use for Facebook. */
export function FacebookGlyph({ className = "h-[18px] w-[18px]" }: { className?: string }) {
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
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
    </svg>
  );
}
