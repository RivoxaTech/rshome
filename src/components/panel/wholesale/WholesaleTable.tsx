"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusMenu } from "@/components/panel/wholesale/StatusMenu";
import type { StaffWholesaleListItem } from "@/features/wholesale/staff-service";

function detailHref(id: number, backHref: string): string {
  return `/panel/wholesale/${id}?back=${encodeURIComponent(backHref)}`;
}

/** Stops a click reaching the row's own navigation (the status pill). */
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

function InquiryRow({ item, backHref }: { item: StaffWholesaleListItem; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <tr
      onClick={() => router.push(href)}
      className="border-border hover:bg-secondary/50 cursor-pointer border-b last:border-b-0"
    >
      <td className="text-muted-foreground px-3 py-3.5">{item.serial}</td>
      <td className="text-muted-foreground px-3 py-3.5 whitespace-nowrap">{item.placedDate}</td>
      <td className="px-3 py-3.5">
        <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
          {item.name}
        </Link>
      </td>
      <td className="text-muted-foreground px-3 py-3.5">{item.business ?? "—"}</td>
      <td className="px-3 py-3.5">{item.city}</td>
      <td className="text-muted-foreground px-3 py-3.5">{item.itemCount}</td>
      <td className="px-3 py-3.5" onClick={stop}>
        <StatusMenu id={item.id} control={item.control} />
      </td>
    </tr>
  );
}

function InquiryCard({ item, backHref }: { item: StaffWholesaleListItem; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <li onClick={() => router.push(href)} className="bg-card border-border cursor-pointer rounded-lg border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
            {item.name}
          </Link>
          {item.business && <p className="text-muted-foreground mt-0.5 truncate text-sm">{item.business}</p>}
          <p className="text-muted-foreground text-xs">
            {item.city} · {item.placedDate}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between" onClick={stop}>
        <StatusMenu id={item.id} control={item.control} />
        <span className="text-muted-foreground text-xs">{item.itemCount} item(s)</span>
      </div>
    </li>
  );
}

export function WholesaleTable({ items, backHref }: { items: StaffWholesaleListItem[]; backHref: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No wholesale inquiries here.</p>;
  }

  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="rounded-l-lg px-3 py-2.5 font-medium">S.N</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Business</th>
                <th className="px-3 py-2.5 font-medium">City</th>
                <th className="px-3 py-2.5 font-medium">Items</th>
                <th className="rounded-r-lg px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:pt-5">
              {items.map((item) => (
                <InquiryRow key={item.id} item={item} backHref={backHref} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map((item) => (
          <InquiryCard key={item.id} item={item} backHref={backHref} />
        ))}
      </ul>
    </>
  );
}
