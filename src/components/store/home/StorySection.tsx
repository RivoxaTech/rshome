import Image from "next/image";
import { Button } from "@/components/store/Button";
import { Section } from "@/components/store/Section";

const STORY_IMAGE_SIZE = { width: 1600, height: 1200 };

/** One full-width "story" section per category (ported from the demo's `Split`). */
export function StorySection({
  id,
  imagePath,
  imageAlt,
  eyebrow,
  title,
  copy,
  cta,
  ctaHref,
  reverse,
  dark,
}: {
  id: string;
  imagePath: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  copy: string;
  cta: string;
  ctaHref: string;
  reverse: boolean;
  dark: boolean;
}) {
  return (
    <Section id={id} className={dark ? "bg-card" : ""}>
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className={`tilt-card shadow-soft overflow-hidden ${reverse ? "lg:order-2" : ""}`}>
          <Image
            src={imagePath}
            alt={imageAlt}
            width={STORY_IMAGE_SIZE.width}
            height={STORY_IMAGE_SIZE.height}
            sizes="(min-width: 1024px) 50vw, 100vw"
            loading="lazy"
            className="h-[360px] w-full object-cover lg:h-[560px]"
          />
        </div>
        <div className={reverse ? "lg:order-1 lg:pr-16" : "lg:pl-16"}>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-5 font-serif text-4xl lg:text-6xl">{title}</h2>
          <p className="text-muted-foreground mt-6 max-w-md text-sm leading-relaxed">{copy}</p>
          <div className="mt-9">
            <Button variant="ghost" href={ctaHref}>
              {cta}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
