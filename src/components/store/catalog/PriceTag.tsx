import type { DisplayPrice } from "@/features/catalog/service";

/** Shows a server-formatted price; the struck-through original appears only when discounted. */
export function PriceTag({
  price,
  from = false,
  className = "text-sm",
}: {
  price: DisplayPrice;
  from?: boolean;
  className?: string;
}) {
  return (
    <p className={`tracking-widest ${className}`}>
      {from && <span className="text-muted-foreground mr-2 text-[10px] tracking-[0.28em] uppercase">From</span>}
      <span className="whitespace-nowrap">{price.amount}</span>
      {price.original && (
        <s className="text-muted-foreground ml-3 text-[0.85em] whitespace-nowrap">
          <span className="sr-only">Original price </span>
          {price.original}
        </s>
      )}
    </p>
  );
}

export function DiscountBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`bg-champagne text-espresso inline-block px-3 py-1.5 text-[10px] tracking-[0.28em] uppercase ${className}`}>
      {label}
    </span>
  );
}
