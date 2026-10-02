import { Skeleton } from "@/components/panel/Skeleton";
import { CategoriesTableSkeleton } from "@/components/panel/categories/CategoriesTableSkeleton";

/** The whole categories list page before anything is known yet (cold navigation): search, table. */
export function CategoriesPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full max-w-[360px] rounded-lg" />
      <CategoriesTableSkeleton />
    </div>
  );
}
