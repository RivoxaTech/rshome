import { Skeleton } from "@/components/panel/Skeleton";

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-card border-border flex flex-col gap-3 rounded-lg border p-4">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-3.5 w-full" />
      ))}
    </div>
  );
}

/** The order detail page before its data has loaded (cold navigation). */
export function OrderDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="order-1 flex flex-col gap-4 lg:order-2">
          <CardSkeleton lines={4} />
        </div>
        <div className="order-2 flex flex-col gap-4 lg:order-1 lg:col-span-2">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}
