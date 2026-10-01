import Image from "next/image";
import { DetailCard } from "@/components/panel/DetailCard";
import type { TopProductView } from "@/features/dashboard/service";

/**
 * Top 5 by units sold in the period (C28), thumbnail via the existing media pipeline. The list
 * fills whatever height the grid gives this card (CSS Grid stretches it to match the Revenue
 * chart card beside it) rather than a fixed row count, so the two cards never show one with a
 * gap of empty space below a short, capped list; it scrolls for whatever doesn't fit, with no
 * visible scrollbar track (`no-scrollbar`, `theme.css`), per the owner's preference.
 */
export function MostSellingList({ products }: { products: TopProductView[] }) {
  return (
    <DetailCard title="Most selling products" className="h-full">
      {products.length === 0 ? (
        <p className="text-muted-foreground text-sm">No products sold in this period yet.</p>
      ) : (
        <ul className="divide-border no-scrollbar flex min-h-0 flex-1 flex-col divide-y overflow-y-auto">
          {products.map((product) => (
            <li key={product.productId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="bg-muted h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                {product.image && (
                  <Image
                    src={product.image.path}
                    alt={product.image.alt}
                    width={product.image.width}
                    height={product.image.height}
                    sizes="48px"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{product.name}</p>
                <p className="text-muted-foreground text-xs">{product.revenue}</p>
              </div>
              <div className="shrink-0 text-right text-sm font-medium whitespace-nowrap">{product.unitsSold} sold</div>
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}
