import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingLayout } from "@/components/store/catalog/ListingLayout";
import type { ListingState } from "@/components/store/catalog/listing-href";
import { siteConfig } from "@/config/site.config";
import { listingQuerySchema, slugSchema } from "@/features/catalog/schemas";
import { getCategoryBySlug, listProducts } from "@/features/catalog/service";
import { buildBreadcrumbJsonLd, serializeJsonLd } from "@/features/seo/jsonld";
import { buildStorefrontMetadata, canonicalUrl } from "@/features/seo/metadata";
import { env } from "@/server/env";

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const slug = slugSchema.safeParse((await params).slug);
  const category = slug.success ? await getCategoryBySlug(slug.data) : null;
  if (!category) notFound();

  return buildStorefrontMetadata({
    appUrl: env.APP_URL,
    path: `/category/${category.slug}`,
    title: category.name,
    description: category.description || siteConfig.tagline,
  });
}

/** One active category and its active child categories; an unknown or inactive slug is a 404. */
export default async function CategoryPage({ params, searchParams }: PageProps<"/category/[slug]">) {
  const slug = slugSchema.safeParse((await params).slug);
  const category = slug.success ? await getCategoryBySlug(slug.data) : null;
  if (!category) notFound();

  const query = listingQuerySchema.parse(await searchParams);
  const listing = await listProducts({ category, nameQuery: null, sort: query.sort, page: query.page });
  // The category lives in the path here, so the query string only carries sort and page.
  const state: ListingState = { sort: query.sort, page: listing.page };

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Shop", url: canonicalUrl(env.APP_URL, "/shop") },
    { name: category.name, url: canonicalUrl(env.APP_URL, `/category/${category.slug}`) },
  ]);

  return (
    <>
      <script type="application/ld+json">{serializeJsonLd(breadcrumb)}</script>
      <ListingLayout
        eyebrow="Collection"
        heading={category.name}
        basePath={`/category/${category.slug}`}
        state={state}
        listing={listing}
      />
    </>
  );
}
