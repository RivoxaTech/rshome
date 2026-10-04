import { Skeleton } from "@/components/panel/Skeleton";

/** Table-shaped rows on desktop, cards on phones. */
function ZonesTableSkeleton() {
  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <Skeleton className="mb-3 h-8 w-full" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-2.5 md:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="bg-card border-border flex flex-col gap-2 rounded-lg border p-3.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
            <Skeleton className="mt-1 h-6 w-20 rounded-full" />
          </li>
        ))}
      </ul>
    </>
  );
}

/** The whole shipping page before anything is known yet (cold navigation). */
export function ShippingPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-40" />
      <ZonesTableSkeleton />
      <Skeleton className="h-40 w-full max-w-2xl rounded-lg" />
    </div>
  );
}
