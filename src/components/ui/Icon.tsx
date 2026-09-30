/** The demo's stroke-icon style (design-reference/src/components/site.tsx): thin outline, no fill. The panel draws a heavier stroke (C21). */
export function Icon({ d, className = "h-[18px] w-[18px]", strokeWidth = 1.2 }: { d: string; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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
} as const;
