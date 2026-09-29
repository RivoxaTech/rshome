import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/store/Section";

const GRID_IMAGE_SIZE = { width: 900, height: 700 };

type WholesaleImage = { path: string; alt: string };
type Cta = { label: string; href: string };

/**
 * The demo's wholesale CTAs are plain styled `<span>`s (not links) -- likely an oversight in a
 * single-page demo with no real destination. Ours link to /wholesale, kept as their own inverted
 * (dark-section) styles rather than the shared Button, since its variants assume a light section.
 */
export function WholesaleSection({
  eyebrow,
  heading,
  copy,
  primaryCta,
  secondaryCta,
  images,
}: {
  eyebrow: string;
  heading: string;
  copy: string;
  primaryCta: Cta;
  secondaryCta: Cta;
  images: WholesaleImage[];
}) {
  return (
    <Section id="wholesale" className="bg-espresso text-background">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <p className="text-champagne text-[11px] tracking-[0.32em] uppercase">{eyebrow}</p>
          <h2 className="mt-5 font-serif text-4xl lg:text-6xl">{heading}</h2>
          <p className="mt-6 max-w-lg text-sm leading-relaxed opacity-75">{copy}</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href={primaryCta.href}
              className="bg-champagne text-espresso hover:bg-background inline-flex px-8 py-4 text-[10px] tracking-[0.28em] uppercase transition-colors"
            >
              {primaryCta.label}
            </Link>
            <Link
              href={secondaryCta.href}
              className="border-background/40 hover:bg-background/10 inline-flex border px-8 py-4 text-[10px] tracking-[0.28em] uppercase transition-colors"
            >
              {secondaryCta.label}
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {images.map((image, index) => (
            <Image
              key={image.path}
              src={image.path}
              alt={image.alt}
              width={GRID_IMAGE_SIZE.width}
              height={GRID_IMAGE_SIZE.height}
              loading="lazy"
              className={`h-44 w-full object-cover lg:h-56 ${index % 3 === 0 ? "mt-8" : ""}`}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}
