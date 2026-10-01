import { Skeleton } from "@/components/panel/Skeleton";
import { WholesaleTableSkeleton } from "@/components/panel/wholesale/WholesaleTableSkeleton";

/** The whole wholesale list page before anything is known yet (cold navigation): tabs, search, table. */
export function WholesalePageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-[360px] rounded-lg" />
      <WholesaleTableSkeleton />
    </div>
  );
}
