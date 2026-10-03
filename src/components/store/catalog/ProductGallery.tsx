"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { ProductImage } from "@/features/catalog/service";

const MAIN_IMAGE_SIZES = "(min-width: 1024px) 460px, 100vw";

/**
 * A swipeable strip (native scroll-snap, so touch works without JS) with thumbnails that jump
 * to an image. The first image is preloaded: it is the page's largest paint.
 */
export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return <div className="bg-muted aspect-[3/4] w-full lg:w-[460px]" />;
  }

  function showImage(index: number) {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollTo({ left: index * strip.clientWidth, behavior: "smooth" });
    setActiveIndex(index);
  }

  function onStripScroll() {
    const strip = stripRef.current;
    if (strip && strip.clientWidth > 0) setActiveIndex(Math.round(strip.scrollLeft / strip.clientWidth));
  }

  return (
    // The photos are a true, uncropped 3:4 at every width — never stretched into a different
    // shape. Below `lg` the strip is `w-full` (the full stacked column); at `lg` it's a tuned
    // fixed width (`lg:w-[460px]`, 3:4 of that is ~613px tall) rather than a width derived from
    // the purchase column's height — that approach (aspect-ratio + flex stretch + width:auto)
    // doesn't resolve predictably once nested this deep and collapsed the text column to zero
    // width in testing. A fixed width keeps the ratio exact and, for a typical amount of product
    // copy, lands close to the purchase column's own height without any fragile CSS trick.
    <div className="lg:w-[460px] lg:shrink-0">
      <div
        ref={stripRef}
        onScroll={onStripScroll}
        className="no-scrollbar flex aspect-[3/4] w-full snap-x snap-mandatory overflow-x-auto"
      >
        {images.map((image, index) => (
          <div key={`${image.path}-${index}`} className="bg-muted h-full w-full shrink-0 snap-center overflow-hidden">
            <Image
              src={image.path}
              alt={image.alt ?? name}
              width={image.width}
              height={image.height}
              sizes={MAIN_IMAGE_SIZES}
              preload={index === 0}
              loading={index === 0 ? undefined : "lazy"}
              className="h-full w-full object-cover transition-transform duration-[1200ms] hover:scale-[1.06]"
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex shrink-0 gap-3">
          {images.map((image, index) => (
            <button
              key={`${image.path}-${index}`}
              type="button"
              onClick={() => showImage(index)}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              aria-current={index === activeIndex}
              className={`h-20 w-16 overflow-hidden border transition-opacity duration-500 ${
                index === activeIndex ? "border-espresso" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <Image
                src={image.path}
                alt=""
                width={image.width}
                height={image.height}
                sizes="64px"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
