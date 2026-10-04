import { Skeleton } from "@/components/panel/Skeleton";

/** Table-shaped rows on desktop, cards on phones — shown while the table reloads or on first load. */
export function UsersTableSkeleton() {
  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <Skeleton className="mb-3 h-8 w-full" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="bg-card border-border flex flex-col gap-2 rounded-lg border p-3.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
            <div className="mt-1 flex items-center justify-between">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The whole list page before anything is known yet (cold navigation): search, table. */
export function UsersPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full max-w-[360px] rounded-lg" />
      <UsersTableSkeleton />
    </div>
  );
}

/** A form-shaped placeholder for the new/edit pages. */
export function UserFormSkeleton() {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  );
}
