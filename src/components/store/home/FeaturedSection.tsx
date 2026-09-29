import Image from "next/image";
import Link from "next/link";
import { CardCartButton } from "@/components/store/cart/CardCartButton";
import { DiscountBadge, PriceTag } from "@/components/store/catalog/PriceTag";
import { Section } from "@/components/store/Section";
import type { ProductCard } from "@/features/catalog/service";

export function FeaturedSection({
  eyebrow,
  heading,
  copy,
  products,
}: {
  eyebrow: string;
  heading: string;
  copy: string;
  products: ProductCard[];
}) {
  if (products.length === 0) return null;

  return (
    <Section id="edit" className="bg-card">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-4 font-serif text-4xl lg:text-6xl">{heading}</h2>
          <p className="text-muted-foreground mt-4 max-w-md text-sm">{copy}</p>
        </div>
        <span className="text-muted-foreground text-[10px] tracking-[0.28em] uppercase">Scroll →</span>
      </div>

      <div className="-mx-6 mt-14 flex snap-x gap-6 overflow-x-auto px-6 pb-6 lg:mx-0 lg:px-0">
        {products.map((product) => (
          <article
            key={product.id}
            className="tilt-card bg-background group w-[280px] shrink-0 snap-start lg:w-[330px]"
          >
            <Link href={`/product/${product.slug}`} className="relative block w-full overflow-hidden">
              {product.image ? (
                <Image
                  src={product.image.path}
                  alt={product.image.alt ?? product.name}
                  width={product.image.width}
                  height={product.image.height}
                  loading="lazy"
                  className="h-[340px] w-full object-cover transition-transform duration-[900ms] group-hover:scale-105"
                />
              ) : (
                <div className="bg-muted h-[340px] w-full" />
              )}
              {product.price.badge && <DiscountBadge label={product.price.badge} className="absolute top-3 left-3" />}
            </Link>
            <div className="p-6">
              <h3 className="font-serif text-2xl">{product.name}</h3>
              {product.shortDescription && (
                <p className="text-muted-foreground mt-1 text-xs">{product.shortDescription}</p>
              )}
              <PriceTag price={product.price} from={product.priceFrom} className="mt-4 text-sm tracking-[0.02em] sm:tracking-widest" />
              <div className="mt-5">
                <CardCartButton card={product} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
