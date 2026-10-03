import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryChips, SearchForm } from "@/components/store/catalog/ListingControls";
import { ListingLayout } from "@/components/store/catalog/ListingLayout";
import type { ListingState } from "@/components/store/catalog/listing-href";
import { siteConfig } from "@/config/site.config";
import { listingQuerySchema } from "@/features/catalog/schemas";
import { getCategoryBySlug, getStoreCategories, listProducts } from "@/features/catalog/service";
import { buildStorefrontMetadata } from "@/features/seo/metadata";
import { env } from "@/server/env";

// Canonical is deliberately the bare path, ignoring ?category=/q=/sort=/page= — standard practice
// for a faceted/paginated listing, so search engines see one URL per shop grid, not one per filter.
export const metadata: Metadata = buildStorefrontMetadata({
  appUrl: env.APP_URL,
  path: "/shop",
  title: "Shop",
  description: siteConfig.tagline,
});

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const query = listingQuerySchema.parse(await searchParams);
  const nameQuery = query.q || null;

  const [categories, category] = await Promise.all([
    getStoreCategories(),
    query.category ? getCategoryBySlug(query.category) : null,
  ]);
  if (query.category && !category) notFound();

  const listing = await listProducts({ category, nameQuery, sort: query.sort, page: query.page });
  const state: ListingState = {
    category: category?.slug,
    q: nameQuery ?? undefined,
    sort: query.sort,
    page: listing.page,
  };

  return (
    <ListingLayout
      eyebrow="Shop"
      heading={nameQuery ? `Results for “${nameQuery}”` : (category?.name ?? "All Products")}
      filters={
        <>
          <SearchForm basePath="/shop" state={state} />
          <CategoryChips basePath="/shop" state={state} categories={categories} />
        </>
      }
      basePath="/shop"
      state={state}
      listing={listing}
    />
  );
}
