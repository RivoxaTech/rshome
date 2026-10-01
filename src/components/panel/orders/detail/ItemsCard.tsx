import Image from "next/image";
import { DetailCard } from "@/components/panel/DetailCard";
import type { StaffOrderView } from "@/features/orders/staff-service";

export function ItemsCard({ items }: { items: StaffOrderView["items"] }) {
  return (
    <DetailCard title="Items">
      <ul className="divide-border flex flex-col divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="bg-muted h-12 w-12 shrink-0 overflow-hidden rounded-lg">
              {item.image && (
                <Image
                  src={item.image.path}
                  alt={item.image.alt}
                  width={item.image.width}
                  height={item.image.height}
                  sizes="48px"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-muted-foreground text-xs">
                {item.variantLabel && <span>{item.variantLabel} · </span>}
                SKU {item.sku} · Qty {item.quantity}
              </p>
            </div>
            <div className="shrink-0 text-right text-sm">
              <p className="font-medium">{item.lineTotal}</p>
              <p className="text-muted-foreground text-xs">{item.unitPrice} each</p>
            </div>
          </li>
        ))}
      </ul>
    </DetailCard>
  );
}
