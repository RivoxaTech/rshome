import Image from "next/image";
import Link from "next/link";
import { DiscountBadge, PriceTag } from "@/components/store/catalog/PriceTag";
import type { ProductCard } from "@/features/catalog/service";

// 2 columns on phones, 3 on laptops, 4 on wide screens (the grid below).
const CARD_IMAGE_SIZES = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw";

/** The shop and category grid, in the same card language as the home page's "Edit" cards. */
export function ProductGrid({ cards, emptyMessage }: { cards: ProductCard[]; emptyMessage: string }) {
  if (cards.length === 0) {
    return <p className="text-muted-foreground py-24 text-center text-sm">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-12 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.id} className="tilt-card bg-card group">
          <Link href={`/product/${card.slug}`} className="block">
            <div className="bg-muted relative aspect-[4/5] overflow-hidden">
              {card.image && (
                <Image
                  src={card.image.path}
                  alt={card.image.alt ?? card.name}
                  width={card.image.width}
                  height={card.image.height}
                  sizes={CARD_IMAGE_SIZES}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-105"
                />
              )}
              {card.price.badge && <DiscountBadge label={card.price.badge} className="absolute top-3 left-3" />}
            </div>
            <div className="p-4 lg:p-6">
              <h3 className="font-serif text-xl leading-tight lg:text-2xl">{card.name}</h3>
              {card.shortDescription && (
                <p className="text-muted-foreground mt-1 text-xs">{card.shortDescription}</p>
              )}
              <PriceTag price={card.price} from={card.priceFrom} className="mt-3 text-xs lg:mt-4 lg:text-sm" />
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
