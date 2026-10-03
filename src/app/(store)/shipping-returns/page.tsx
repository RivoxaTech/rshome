import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaticPageView } from "@/components/store/pages/StaticPageView";
import { getPageBySlug } from "@/content/pages";
import { buildPageMetadata } from "@/features/seo/metadata";
import { env } from "@/server/env";

const SLUG = "shipping-returns";

export async function generateMetadata(): Promise<Metadata> {
  const page = getPageBySlug(SLUG);
  if (!page) notFound();
  return buildPageMetadata(page, env.APP_URL);
}

export default function ShippingReturnsPage() {
  return <StaticPageView slug={SLUG} />;
}
