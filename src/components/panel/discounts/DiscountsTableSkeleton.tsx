import { Skeleton } from "@/components/panel/Skeleton";

/** Table-shaped rows on desktop, cards on phones — shown while the table reloads or on first load. */
export function DiscountsTableSkeleton() {
  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <Skeleton className="mb-3 h-8 w-full" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="bg-card border-border flex flex-col gap-2 rounded-lg border p-3.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
            <div className="mt-1 flex items-center justify-between">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The whole list page before anything is known yet (cold navigation): tabs, search, table. */
export function DiscountsPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-full max-w-md rounded-lg" />
      <Skeleton className="h-9 w-full max-w-[360px] rounded-lg" />
      <DiscountsTableSkeleton />
    </div>
  );
}
