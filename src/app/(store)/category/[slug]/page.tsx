import { notFound } from "next/navigation";
import { ListingLayout } from "@/components/store/catalog/ListingLayout";
import type { ListingState } from "@/components/store/catalog/listing-href";
import { listingQuerySchema, slugSchema } from "@/features/catalog/schemas";
import { getCategoryBySlug, listProducts } from "@/features/catalog/service";

/** One active category and its active child categories; an unknown or inactive slug is a 404. */
export default async function CategoryPage({ params, searchParams }: PageProps<"/category/[slug]">) {
  const slug = slugSchema.safeParse((await params).slug);
  const category = slug.success ? await getCategoryBySlug(slug.data) : null;
  if (!category) notFound();

  const query = listingQuerySchema.parse(await searchParams);
  const listing = await listProducts({ category, nameQuery: null, sort: query.sort, page: query.page });
  // The category lives in the path here, so the query string only carries sort and page.
  const state: ListingState = { sort: query.sort, page: listing.page };

  return (
    <ListingLayout
      eyebrow="Collection"
      heading={category.name}
      basePath={`/category/${category.slug}`}
      state={state}
      listing={listing}
    />
  );
}
