import { Skeleton } from "@/components/panel/Skeleton";

/** The permissions matrix before it's known (cold navigation): a header row of role columns and permission rows. */
export function RolesPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
      </div>
      <div className="bg-card border-border overflow-hidden rounded-lg border p-4">
        <div className="mb-3 flex gap-6">
          <Skeleton className="h-16 w-48" />
          <Skeleton className="h-16 w-36" />
          <Skeleton className="h-16 w-36" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A form-shaped placeholder for the new/edit role pages: a name field and a few permission groups. */
export function RoleFormSkeleton() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Skeleton className="h-6 w-48" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="bg-card border-border flex flex-col gap-3 rounded-lg border p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
