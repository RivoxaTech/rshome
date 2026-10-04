import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/store/Section";
import type { StoreCategory } from "@/features/catalog/service";

// Categories have no width/height column (unlike product_images): the demo's own hardcoded
// hero/collection <img> dimensions show this is fine, since every card here has a fixed
// Tailwind height with object-cover -- the box size never depends on the intrinsic ratio.
const CATEGORY_IMAGE_SIZE = { width: 1600, height: 1200 };

// A bespoke 4-item mosaic (ported from the demo); a 5th+ category falls back to a plain
// half-width card rather than crashing or squeezing into the layout meant for four. `sizes` is
// each card's share of the 12-column grid above `lg`, full width below it (S22 SPD-03).
const CARD_LAYOUTS = [
  { span: "lg:col-span-7 lg:row-span-2", height: "h-[360px] lg:h-[680px]", sizes: "(min-width: 1024px) 58vw, 100vw" },
  { span: "lg:col-span-5", height: "h-[320px]", sizes: "(min-width: 1024px) 42vw, 100vw" },
  { span: "lg:col-span-5", height: "h-[320px]", sizes: "(min-width: 1024px) 42vw, 100vw" },
  { span: "lg:col-span-12", height: "h-[320px] lg:h-[420px]", sizes: "100vw" },
] as const;
const DEFAULT_CARD_LAYOUT = { span: "lg:col-span-6", height: "h-[320px]", sizes: "(min-width: 1024px) 50vw, 100vw" } as const;

export function CollectionsSection({
  eyebrow,
  heading,
  categories,
}: {
  eyebrow: string;
  heading: string;
  categories: StoreCategory[];
}) {
  if (categories.length === 0) return null;

  return (
    <Section id="collections">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 max-w-xl font-serif text-4xl lg:text-6xl">{heading}</h2>

      <div className="mt-14 grid gap-5 lg:grid-cols-12">
        {categories.map((category, index) => {
          const layout = CARD_LAYOUTS[index] ?? DEFAULT_CARD_LAYOUT;
          return (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className={`group relative block overflow-hidden ${layout.span} ${layout.height}`}
            >
              {category.imagePath && (
                <Image
                  src={category.imagePath}
                  alt={category.name}
                  width={CATEGORY_IMAGE_SIZE.width}
                  height={CATEGORY_IMAGE_SIZE.height}
                  sizes={layout.sizes}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-[1.06]"
                />
              )}
              <div className="from-espresso/80 absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />
              <div className="text-background absolute bottom-0 p-8">
                <h3 className="font-serif text-3xl">{category.name}</h3>
                {category.description && (
                  <p className="mt-2 max-w-xs text-xs opacity-80">{category.description}</p>
                )}
                <span className="mt-4 inline-block text-[10px] tracking-[0.28em] uppercase opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  Explore Collection →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
