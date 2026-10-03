/** Pure robots.txt rules (REQUIREMENTS SF-10): allow the storefront, disallow everything staff/API-only. */
import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/features/seo/metadata";

const DISALLOWED_PATHS = ["/panel", "/api", "/order", "/track", "/checkout", "/cart"];

export function buildRobotsRules(appUrl: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS },
    sitemap: canonicalUrl(appUrl, "/sitemap.xml"),
  };
}
