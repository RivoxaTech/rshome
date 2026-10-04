/**
 * Pure metadata helpers shared by every storefront page (REQUIREMENTS SF-10). No DB or Next.js
 * import beyond the `Metadata` type, so these are unit-testable without rendering anything.
 */
import type { Metadata } from "next";
import type { PageContent } from "@/features/pages/schema";

/** `APP_URL` plus a leading-slash path, with no trailing slash (except the root `/` itself). */
export function canonicalUrl(appUrl: string, path: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const normalizedPath = path === "/" ? "" : `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  return `${base}${normalizedPath}`;
}

/** Pages that must never be indexed (checkout, cart, order, track, panel): REQUIREMENTS SF-10. */
export const noindexRobots: Metadata["robots"] = { index: false, follow: false };

/** The next/image custom loader's URL shape (`lib/image-loader.ts`), built as an absolute URL for Open Graph. */
export function mediaImageUrl(appUrl: string, path: string, width: 400 | 800 | 1200 = 1200): string {
  return `${appUrl.replace(/\/+$/, "")}/media/${path}-${width}.webp`;
}

type StorefrontMetadataInput = {
  appUrl: string;
  path: string;
  title: string;
  description: string;
  /** Absolute URL; omitted entirely when there's no real image (never invent one). */
  image?: string;
  type?: "website" | "article";
};

/** Canonical + Open Graph + Twitter card, shared by every indexed storefront page. */
export function buildStorefrontMetadata(input: StorefrontMetadataInput): Metadata {
  const url = canonicalUrl(input.appUrl, input.path);
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      type: input.type ?? "website",
      ...(input.image ? { images: [{ url: input.image }] } : {}),
    },
    twitter: {
      card: input.image ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      ...(input.image ? { images: [input.image] } : {}),
    },
  };
}

/** One of the five `src/content/pages.ts` entries: no image, since none of them has one (never invent a file). */
export function buildPageMetadata(page: PageContent, appUrl: string): Metadata {
  return buildStorefrontMetadata({ appUrl, path: `/${page.slug}`, title: page.title, description: page.metaDescription });
}
