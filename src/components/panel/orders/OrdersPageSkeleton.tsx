import { Skeleton } from "@/components/panel/Skeleton";
import { OrdersTableSkeleton } from "@/components/panel/orders/OrdersTableSkeleton";

/** The whole orders list page before anything is known yet (cold navigation): tabs, search, table. */
export function OrdersPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-[360px] rounded-lg" />
      <OrdersTableSkeleton />
    </div>
  );
}
