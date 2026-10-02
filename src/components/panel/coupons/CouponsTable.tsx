"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/panel/StatusPill";
import { CouponActiveToggle } from "@/components/panel/coupons/CouponRowActions";
import type { StaffCouponListItem } from "@/features/coupons/staff-service";
import { COUPON_STATUS_COLORS, COUPON_STATUS_LABELS } from "@/features/coupons/status";

function detailHref(id: number, backHref: string): string {
  return `/panel/coupons/${id}?back=${encodeURIComponent(backHref)}`;
}

/** Stops a click reaching the row's own navigation (the code link and the quick action). */
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

function Dates({ item }: { item: StaffCouponListItem }) {
  if (!item.startsAt && !item.endsAt) return <span className="text-muted-foreground">Always</span>;
  return (
    <span className="flex flex-col text-xs">
      <span>{item.startsAt ? `From ${item.startsAt}` : "From now"}</span>
      <span className="text-muted-foreground">{item.endsAt ? `Until ${item.endsAt}` : "No end"}</span>
    </span>
  );
}

function CouponRow({ item, backHref }: { item: StaffCouponListItem; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <tr onClick={() => router.push(href)} className="border-border hover:bg-secondary/50 cursor-pointer border-b last:border-b-0">
      <td className="text-muted-foreground px-3 py-2">{item.serial}</td>
      <td className="px-3 py-2">
        <Link href={href} onClick={stop} className="text-primary font-mono font-medium hover:underline">
          {item.code}
        </Link>
      </td>
      <td className="px-3 py-2 font-medium whitespace-nowrap">{item.valueText}</td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">{item.minOrderText ?? "—"}</td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{item.usageText}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Dates item={item} />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1" onClick={stop}>
          <StatusPill label={COUPON_STATUS_LABELS[item.status]} colors={COUPON_STATUS_COLORS[item.status]} />
          <CouponActiveToggle id={item.id} isActive={item.isActive} />
        </div>
      </td>
    </tr>
  );
}

function CouponCard({ item, backHref }: { item: StaffCouponListItem; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <li onClick={() => router.push(href)} className="bg-card border-border cursor-pointer rounded-lg border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={href} onClick={stop} className="text-primary min-w-0 font-mono font-medium hover:underline">
          {item.code}
        </Link>
        <span className="shrink-0 text-sm font-medium">{item.valueText}</span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {item.minOrderText ? `Min order ${item.minOrderText} · ` : ""}Used {item.usageText}
      </p>
      <div className="mt-2 text-xs">
        <Dates item={item} />
      </div>
      <div className="mt-2.5 flex items-center gap-1" onClick={stop}>
        <StatusPill label={COUPON_STATUS_LABELS[item.status]} colors={COUPON_STATUS_COLORS[item.status]} />
        <CouponActiveToggle id={item.id} isActive={item.isActive} />
      </div>
    </li>
  );
}

export function CouponsTable({ items, backHref }: { items: StaffCouponListItem[]; backHref: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No coupons match this view.</p>;
  }

  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="rounded-l-lg px-3 py-2 font-medium">S.N</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Min order</th>
                <th className="px-3 py-2 font-medium">Usage</th>
                <th className="px-3 py-2 font-medium">Dates</th>
                <th className="rounded-r-lg px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:pt-4">
              {items.map((item) => (
                <CouponRow key={item.id} item={item} backHref={backHref} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map((item) => (
          <CouponCard key={item.id} item={item} backHref={backHref} />
        ))}
      </ul>
    </>
  );
}
