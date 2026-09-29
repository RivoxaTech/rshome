import Link from "next/link";
import type { ReactNode } from "react";

const BASE =
  "inline-flex items-center justify-center uppercase transition-all duration-500 disabled:pointer-events-none disabled:opacity-40";

const SIZE = "px-8 py-4 text-[10px] tracking-[0.28em]";
// Fills a product card. On phones the 2-column grid leaves about 110px, so the type is a touch
// smaller and tighter there to keep "Choose options" on one line; from `sm` it matches SIZE.
const CARD_SIZE =
  "w-full px-2 py-4 text-[9px] tracking-[0.16em] whitespace-nowrap sm:px-3 sm:text-[10px] sm:tracking-[0.28em]";

const VARIANTS = {
  solid: "bg-espresso text-background hover:bg-champagne hover:text-espresso",
  outline: "border border-espresso/40 hover:border-espresso hover:bg-espresso/5",
  ghost: "border-b border-espresso/30 px-0 py-2 hover:border-champagne hover:text-champagne",
} as const;

type ButtonVariant = keyof typeof VARIANTS;

/**
 * Ported from design-reference/src/components/site.tsx (Button). Renders a `Link` when `href`
 * is given, otherwise a `<button>` (non-submitting unless `type="submit"`).
 */
export function Button({
  href,
  variant = "solid",
  type = "button",
  disabled = false,
  fullWidth = false,
  onClick,
  children,
}: {
  href?: string;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  /** Only for the `<button>` form, e.g. "Sold out". */
  disabled?: boolean;
  /** Fills its container, sized for a product card. */
  fullWidth?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = `${BASE} ${fullWidth ? CARD_SIZE : SIZE} ${VARIANTS[variant]}`;
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={className}>
      {children}
    </button>
  );
}
