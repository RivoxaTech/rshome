/**
 * Pure sitemap entry builder (REQUIREMENTS SF-10). Takes already-fetched plain arrays — the
 * visibility/draft/archived filtering is `features/catalog`'s own job (`getStoreCategories`,
 * `getSitemapProducts`), done once before this is called, never duplicated here — so this is just
 * composition, unit-testable with no DB.
 */
import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/features/seo/metadata";

export type SitemapCategory = { slug: string };
export type SitemapProduct = { slug: string; updatedAt: Date };
export type SitemapPage = { slug: string };

export function buildSitemapEntries(input: {
  appUrl: string;
  categories: SitemapCategory[];
  products: SitemapProduct[];
  pages: SitemapPage[];
  wholesaleEnabled: boolean;
}): MetadataRoute.Sitemap {
  const url = (path: string) => canonicalUrl(input.appUrl, path);

  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/shop"), changeFrequency: "daily", priority: 0.9 },
  ];

  for (const category of input.categories) {
    entries.push({ url: url(`/category/${category.slug}`), changeFrequency: "daily", priority: 0.7 });
  }
  for (const product of input.products) {
    entries.push({ url: url(`/product/${product.slug}`), lastModified: product.updatedAt, changeFrequency: "weekly", priority: 0.6 });
  }
  for (const page of input.pages) {
    entries.push({ url: url(`/${page.slug}`), changeFrequency: "monthly", priority: 0.3 });
  }
  if (input.wholesaleEnabled) {
    entries.push({ url: url("/wholesale"), changeFrequency: "monthly", priority: 0.5 });
  }

  return entries;
}
