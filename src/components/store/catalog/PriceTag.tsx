import type { DisplayPrice } from "@/features/pricing/display";

/**
 * A server-formatted price on one line: an optional small "From", the struck-through original
 * (smaller, muted) when discounted, then the current price. Callers pass the size and tracking;
 * cards tighten the tracking on phones so the row still fits a 2-column grid at 375px.
 */
export function PriceTag({
  price,
  from = false,
  className = "text-sm tracking-widest",
}: {
  price: DisplayPrice;
  from?: boolean;
  className?: string;
}) {
  return (
    <p className={`whitespace-nowrap ${className}`}>
      {from && (
        <span className="text-muted-foreground mr-1 text-[9px] tracking-[0.14em] uppercase sm:mr-2 sm:text-[10px] sm:tracking-[0.28em]">
          From
        </span>
      )}
      {price.original && <OriginalPrice value={price.original} />}
      <span>{price.amount}</span>
    </p>
  );
}

/** Below `sm` the currency code is dropped from the struck price: the current price carries it. */
function OriginalPrice({ value }: { value: string }) {
  const [currency, ...amount] = value.split(" ");
  return (
    <s className="text-muted-foreground mr-1 text-[0.85em] sm:mr-2">
      <span className="sr-only">Original price </span>
      <span className="hidden sm:inline">{currency} </span>
      {amount.join(" ")}
    </s>
  );
}

export function DiscountBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`bg-champagne text-espresso inline-block px-3 py-1.5 text-[10px] tracking-[0.28em] uppercase ${className}`}>
      {label}
    </span>
  );
}
