import type { MetadataRoute } from "next";
import { features } from "@/config/features";
import { PAGES } from "@/content/pages";
import { getSitemapProducts, getStoreCategories } from "@/features/catalog/service";
import { buildSitemapEntries } from "@/features/seo/sitemap";
import { env } from "@/server/env";

// Cached by default (Next's sitemap.js convention); forced dynamic so a catalogue, category or
// settings change is reflected on the very next request (ARCHITECTURE.md D7) — this file sits
// outside the (store) layout's own `dynamic = "force-dynamic"`, so it needs its own.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([getStoreCategories(), getSitemapProducts()]);

  return buildSitemapEntries({
    appUrl: env.APP_URL,
    categories: categories.map((category) => ({ slug: category.slug })),
    products,
    pages: PAGES.map((page) => ({ slug: page.slug })),
    wholesaleEnabled: features.wholesale,
  });
}
