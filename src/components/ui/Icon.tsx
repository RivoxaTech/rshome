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
} as const;
