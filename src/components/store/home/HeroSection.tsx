"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { Button } from "@/components/store/Button";
import { staticImagePath, type StaticImageSet } from "@/lib/image-loader";

type Cta = { label: string; href: string };

const PARALLAX_FACTOR = 0.25;
const restingTransform = (offset: number) => `translateY(${offset * PARALLAX_FACTOR}px) scale(1.05)`;

/**
 * The only client component on the home page: the demo's scroll-linked parallax on the hero
 * background (ported from design-reference/src/routes/index.tsx). Everything else on the page
 * is static enough to stay a Server Component (ARCHITECTURE.md §5). The photos are the static
 * sets in `config/home-content.ts` (S22 HERO-01), rendered through the `public/` loader.
 */
export function HeroSection({
  eyebrow,
  headingLines,
  copy,
  primaryCta,
  secondaryCta,
  image,
  accentImage,
}: {
  eyebrow: string;
  headingLines: readonly string[];
  copy: string;
  primaryCta: Cta;
  secondaryCta: Cta;
  image: StaticImageSet;
  accentImage: StaticImageSet;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // One style write per animation frame, straight to the element, and none once the hero has
  // scrolled out of view (S22 SPD-04): no React state, so nothing re-renders on scroll.
  useEffect(() => {
    const section = sectionRef.current;
    const picture = imageRef.current;
    if (!section || !picture) return;
    // Reduced motion (S22 QA-06): the photo stays at its resting position, no scroll listener.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const offset = window.scrollY;
      if (offset > section.offsetHeight) return;
      picture.style.transform = restingTransform(offset);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={sectionRef} className="relative h-[100svh] min-h-[620px] overflow-hidden">
      <Image
        ref={imageRef}
        src={image.basePath}
        loader={({ width }) => staticImagePath(image, width)}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes="100vw"
        preload
        className="absolute inset-0 h-[120%] w-full object-cover"
        style={{ transform: restingTransform(0) }}
      />
      <div className="from-background/90 via-background/40 absolute inset-0 bg-gradient-to-r to-transparent" />
      <div className="absolute inset-0 flex items-center px-6 lg:px-16">
        <div className="rise max-w-xl">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-6 font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl lg:text-8xl">
            {headingLines.map((line, index) => (
              <span key={line}>
                {line}
                {index < headingLines.length - 1 && <br />}
              </span>
            ))}
          </h1>
          <p className="text-muted-foreground mt-6 max-w-md text-sm leading-relaxed">{copy}</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button href={primaryCta.href}>{primaryCta.label}</Button>
            <Button href={secondaryCta.href} variant="outline">
              {secondaryCta.label}
            </Button>
          </div>
        </div>
      </div>

      <div className="float-soft absolute right-6 bottom-16 hidden lg:block">
        <Image
          src={accentImage.basePath}
          loader={({ width }) => staticImagePath(accentImage, width)}
          alt={accentImage.alt}
          width={accentImage.width}
          height={accentImage.height}
          sizes="288px"
          loading="lazy"
          className="shadow-lift h-52 w-72 object-cover"
        />
      </div>
    </div>
  );
}
