import { Skeleton } from "@/components/panel/Skeleton";
import { ProductsTableSkeleton } from "@/components/panel/products/ProductsTableSkeleton";

/** The whole products list page before anything is known yet (cold navigation): tabs, search, table. */
export function ProductsPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-full max-w-sm rounded-lg" />
      <Skeleton className="h-9 w-full max-w-[360px] rounded-lg" />
      <ProductsTableSkeleton />
    </div>
  );
}
