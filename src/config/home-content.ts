import type { StaticImageSet } from "@/lib/image-loader";

/**
 * The hero's two photos (S22 HERO-01): static files in `public/hero`, never a category's image,
 * so the hero can't disappear when the catalogue changes. To change them, run
 * `node scripts/hero-images.mjs <main photo> <accent photo>` (sharp writes these exact files),
 * then update `width`/`height` to the largest file's and the alt text; nothing else reads them.
 * The main photo also serves as the home page's Open Graph image.
 */
export const HERO_IMAGES = {
  main: {
    basePath: "/hero/hero-main",
    width: 1200,
    height: 896,
    alt: "A walnut console table with a black horse-head sculpture, art books and an orchid beneath an abstract gold and grey painting",
  },
  accent: {
    basePath: "/hero/hero-accent",
    width: 1200,
    height: 896,
    alt: "A ribbed glass cake dome on a silver tray at a table set with gold-rimmed plates and cut-crystal glasses",
  },
} as const satisfies Record<string, StaticImageSet>;

export type StoryContent = { eyebrow: string; title: string; copy: string; cta: string; reverse: boolean; dark: boolean };

/**
 * Marketing copy for the home page that isn't product/category data (CLAUDE.md #9: no
 * client-specific text in components). Ported from design-reference/src/routes/index.tsx.
 *
 * Story sections (ARCHITECTURE.md D64, 6 Oct follow-up): whether a category gets one at all is
 * the panel's own `categories.show_on_homepage` toggle, not this file — a category added or
 * renamed in the panel must never silently lose its section. `stories` below is only a set of
 * hand-written overrides for the categories the demo itself wrote custom copy for; any other
 * category derives its section from its own name/description instead (`storyFor` in
 * `app/(store)/page.tsx`), so every category with the toggle on and an image gets a real section.
 */
export const homeContent = {
  hero: {
    eyebrow: "RS Home • Karachi",
    headingLines: ["The Art", " Of Being Home"],
    copy: "Curated home essentials, elegant tableware and timeless pieces for your space.",
    primaryCta: { label: "Shop Collection", href: "/shop" },
    secondaryCta: { label: "Explore Tableware", href: "/category/tableware" },
  },
  collections: {
    eyebrow: "Collections",
    heading: "Curated for your home",
  },
  edit: {
    eyebrow: "Featured",
    heading: "The RS Home Edit",
    copy: "Timeless pieces selected to bring elegance to everyday spaces.",
  },
  stories: {
    tableware: {
      eyebrow: "Tableware",
      title: "Tableware, refined.",
      copy: "Plates, bowls, cups, serving pieces, glassware and cutlery — composed for tables that deserve a second look.",
      cta: "Shop Tableware →",
      reverse: false,
      dark: false,
    },
    "tea-sets": {
      eyebrow: "Tea Sets",
      title: "Make tea time beautiful",
      copy: "Thoughtfully designed pieces for slow mornings, afternoon gatherings and memorable moments.",
      cta: "Shop Tea Sets",
      reverse: true,
      dark: true,
    },
    trays: {
      eyebrow: "Trays",
      title: "Presentation matters",
      copy: "Serve beautifully. Style effortlessly.",
      cta: "Explore Trays",
      reverse: false,
      dark: false,
    },
    decor: {
      eyebrow: "Decor",
      title: "The details make the space",
      copy: "Discover elegant accents designed to complete your home.",
      cta: "Shop Decor",
      reverse: true,
      dark: false,
    },
  } as Record<string, StoryContent>,
  wholesale: {
    eyebrow: "Wholesale & Bulk Orders",
    heading: "Shopping for your business?",
    copy: "Looking for tableware, tea sets or home essentials in larger quantities? RS HOME offers wholesale and bulk purchasing options for businesses, events and hospitality requirements.",
    primaryCta: { label: "Request Wholesale Pricing", href: "/wholesale" },
    secondaryCta: { label: "Contact Us", href: "/wholesale" },
    // Same 4 seeded category images as the Collections grid, reused in the demo's mosaic order.
    imageCategorySlugs: ["tableware", "tea-sets", "trays", "decor"],
  },
  why: {
    eyebrow: "Why RS Home",
    points: [
      { title: "Curated Selection", copy: "Every piece chosen for form, finish and longevity." },
      { title: "Premium Materials", copy: "Fine ceramic, glass and brushed metal detailing." },
      { title: "Nationwide Delivery", copy: "Carefully packed and delivered across Pakistan." },
      { title: "Wholesale Ready", copy: "Bulk pricing for hospitality, events and retail." },
    ],
  },
} as const;

/**
 * A story section's content for one category (D64): the hand-written override above when one
 * exists for this slug, otherwise derived straight from the category's own name/description —
 * so a category the panel adds or renames always gets a real section, never a blank one.
 * `index` alternates the image side, the same left/right rhythm the hand-written set already has.
 */
export function storyFor(category: { slug: string; name: string; description: string | null }, index: number): StoryContent {
  const override: StoryContent | undefined = homeContent.stories[category.slug];
  if (override) return override;
  return {
    eyebrow: category.name,
    title: category.name,
    copy: category.description ?? "",
    cta: `Shop ${category.name} →`,
    reverse: index % 2 === 1,
    dark: false,
  };
}
