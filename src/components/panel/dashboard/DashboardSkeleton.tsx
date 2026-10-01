import { Skeleton } from "@/components/panel/Skeleton";

/** The whole dashboard page before anything is known yet (cold navigation). */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-48" />
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
