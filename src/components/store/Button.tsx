import Link from "next/link";
import type { ReactNode } from "react";

const BASE =
  "inline-flex items-center justify-center px-8 py-4 text-[10px] tracking-[0.28em] uppercase transition-all duration-500";

const VARIANTS = {
  solid: "bg-espresso text-background hover:bg-champagne hover:text-espresso",
  outline: "border border-espresso/40 hover:border-espresso hover:bg-espresso/5",
  ghost: "border-b border-espresso/30 px-0 py-2 hover:border-champagne hover:text-champagne",
} as const;

type ButtonVariant = keyof typeof VARIANTS;

/**
 * Ported from design-reference/src/components/site.tsx (Button). Renders a `Link` when `href`
 * is given, otherwise a plain, non-submitting `<button>` -- used for "Add to Cart", which is
 * inert until S6 wires up the cart.
 */
export function Button({
  href,
  variant = "solid",
  children,
}: {
  href?: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  const className = `${BASE} ${VARIANTS[variant]}`;
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className}>
      {children}
    </button>
  );
}
