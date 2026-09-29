import type { ReactNode } from "react";
import { Pagination } from "@/components/store/catalog/ListingControls";
import { ProductGrid } from "@/components/store/catalog/ProductGrid";
import { SortMenu } from "@/components/store/catalog/SortMenu";
import type { ListingState } from "@/components/store/catalog/listing-href";
import { PageContainer } from "@/components/store/PageContainer";
import type { ProductListing } from "@/features/catalog/service";

/** Page frame shared by /shop and /category/[slug]. */
export function ListingLayout({
  eyebrow,
  heading,
  filters,
  basePath,
  state,
  listing,
}: {
  eyebrow: string;
  heading: string;
  filters?: ReactNode;
  basePath: string;
  state: ListingState;
  listing: ProductListing;
}) {
  return (
    <PageContainer>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 font-serif text-4xl lg:text-6xl">{heading}</h1>

      {filters && <div className="mt-6 grid gap-5">{filters}</div>}

      <div className="border-border mt-8 flex items-center justify-between gap-4 border-t pt-5">
        <p className="text-muted-foreground text-[10px] tracking-[0.28em] uppercase">
          {listing.totalCount} {listing.totalCount === 1 ? "product" : "products"}
        </p>
        <SortMenu basePath={basePath} state={state} />
      </div>

      <div className="mt-8">
        <ProductGrid cards={listing.cards} emptyMessage="No products match your search." />
      </div>

      <Pagination basePath={basePath} state={state} totalPages={listing.totalPages} />
    </PageContainer>
  );
}
