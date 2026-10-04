import { Skeleton } from "@/components/panel/Skeleton";

/** Table-shaped rows on desktop, cards on phones — shown while the table reloads. */
export function AuditTableSkeleton() {
  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <Skeleton className="mb-3 h-8 w-full" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-2.5 md:hidden">
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index} className="bg-card border-border flex flex-col gap-2 rounded-lg border p-3.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-52" />
          </li>
        ))}
      </ul>
    </>
  );
}

/** The whole audit page before anything is known yet (cold navigation): filters, table. */
export function AuditPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border-border grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
      <AuditTableSkeleton />
    </div>
  );
}
