import type { Metadata } from "next";
import { CollectionsSection } from "@/components/store/home/CollectionsSection";
import { FeaturedSection } from "@/components/store/home/FeaturedSection";
import { HeroSection } from "@/components/store/home/HeroSection";
import { StorySection } from "@/components/store/home/StorySection";
import { WholesaleSection } from "@/components/store/home/WholesaleSection";
import { WhySection } from "@/components/store/home/WhySection";
import { features } from "@/config/features";
import { HERO_IMAGES, homeContent } from "@/config/home-content";
import { siteConfig } from "@/config/site.config";
import { getHomeFeaturedProducts, getStoreCategories } from "@/features/catalog/service";
import { buildOrganizationJsonLd, serializeJsonLd } from "@/features/seo/jsonld";
import { buildStorefrontMetadata, canonicalUrl } from "@/features/seo/metadata";
import { getContactInfo, getSocialLinks, getStoreIdentity } from "@/features/settings/service";
import { staticImagePath } from "@/lib/image-loader";
import { env } from "@/server/env";

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getStoreIdentity();

  return buildStorefrontMetadata({
    appUrl: env.APP_URL,
    path: "/",
    // The panel-editable name (D56), not the build-time default (S22 BUG-28).
    title: identity.storeName,
    description: siteConfig.tagline,
    // The hero's largest file (S22 HERO-01): a static asset, so the home page always has one.
    image: canonicalUrl(env.APP_URL, staticImagePath(HERO_IMAGES.main, HERO_IMAGES.main.width)),
  });
}

export default async function HomePage() {
  const [categories, featuredProducts, identity, contact, socialLinks] = await Promise.all([
    getStoreCategories(),
    getHomeFeaturedProducts(),
    getStoreIdentity(),
    getContactInfo(),
    getSocialLinks(),
  ]);
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

  const wholesaleImages = homeContent.wholesale.imageCategorySlugs.flatMap((slug) => {
    const category = categoryBySlug.get(slug);
    return category?.imagePath ? [{ path: category.imagePath, alt: category.name }] : [];
  });

  const organizationJsonLd = buildOrganizationJsonLd({
    name: identity.storeName,
    url: canonicalUrl(env.APP_URL, "/"),
    telephone: contact.phone || null,
    sameAs: [socialLinks.facebook, socialLinks.instagram].filter((link): link is string => Boolean(link)),
  });

  return (
    <div className="bg-background text-foreground overflow-x-hidden">
      <script type="application/ld+json">{serializeJsonLd(organizationJsonLd)}</script>
      <HeroSection
        eyebrow={homeContent.hero.eyebrow}
        headingLines={homeContent.hero.headingLines}
        copy={homeContent.hero.copy}
        primaryCta={homeContent.hero.primaryCta}
        secondaryCta={homeContent.hero.secondaryCta}
        image={HERO_IMAGES.main}
        accentImage={HERO_IMAGES.accent}
      />

      <CollectionsSection
        eyebrow={homeContent.collections.eyebrow}
        heading={homeContent.collections.heading}
        categories={categories}
      />

      <FeaturedSection
        eyebrow={homeContent.edit.eyebrow}
        heading={homeContent.edit.heading}
        copy={homeContent.edit.copy}
        products={featuredProducts}
      />

      {categories.map((category) => {
        const story = homeContent.stories[category.slug];
        if (!story || !category.imagePath) return null;
        return (
          <StorySection
            key={category.id}
            id={category.slug}
            imagePath={category.imagePath}
            imageAlt={category.name}
            eyebrow={story.eyebrow}
            title={story.title}
            copy={story.copy}
            cta={story.cta}
            ctaHref={`/category/${category.slug}`}
            reverse={story.reverse}
            dark={story.dark}
          />
        );
      })}

      {features.wholesale && (
        <WholesaleSection
          eyebrow={homeContent.wholesale.eyebrow}
          heading={homeContent.wholesale.heading}
          copy={homeContent.wholesale.copy}
          primaryCta={homeContent.wholesale.primaryCta}
          secondaryCta={homeContent.wholesale.secondaryCta}
          images={wholesaleImages}
        />
      )}

      <WhySection eyebrow={homeContent.why.eyebrow} points={homeContent.why.points} />
    </div>
  );
}
