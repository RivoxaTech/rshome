"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/store/Button";

type Cta = { label: string; href: string };
type HeroImage = { path: string; alt: string; width: number; height: number };

/**
 * The only client component on the home page: the demo's scroll-linked parallax on the hero
 * background (ported from design-reference/src/routes/index.tsx). Everything else on the page
 * is static enough to stay a Server Component (ARCHITECTURE.md §5).
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
  image: HeroImage;
  accentImage: HeroImage | null;
}) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const onScroll = () => setOffset(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative h-[100svh] min-h-[620px] overflow-hidden">
      <Image
        src={image.path}
        alt={image.alt}
        width={image.width}
        height={image.height}
        preload
        className="absolute inset-0 h-[120%] w-full object-cover"
        style={{ transform: `translateY(${offset * 0.25}px) scale(1.05)` }}
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

      {accentImage && (
        <div className="float-soft absolute right-6 bottom-16 hidden lg:block">
          <Image
            src={accentImage.path}
            alt={accentImage.alt}
            width={accentImage.width}
            height={accentImage.height}
            loading="lazy"
            className="shadow-lift h-52 w-72 object-cover"
          />
        </div>
      )}
    </div>
  );
}
