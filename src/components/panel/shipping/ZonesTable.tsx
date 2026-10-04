"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoveToControl } from "@/components/panel/MoveToControl";
import { StatusPill } from "@/components/panel/StatusPill";
import { ZoneActiveToggle } from "@/components/panel/shipping/ZoneRowActions";
import { ZONE_MODE_LABELS } from "@/features/shipping/schemas";
import type { StaffZoneListItem } from "@/features/shipping/staff-readers";
import { moveZoneAction } from "@/app/panel/(protected)/shipping/actions";
import { PILL_COLORS } from "@/lib/pill-colors";

const ACTIVE_COLORS = PILL_COLORS.emerald;
const INACTIVE_COLORS = PILL_COLORS.muted;
const FALLBACK_COLORS = PILL_COLORS.sky;

function detailHref(id: number, backHref: string): string {
  return `/panel/shipping/${id}?back=${encodeURIComponent(backHref)}`;
}

/** Stops a click reaching the row's own navigation (the name link and the quick actions). */
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

function RateText({ item }: { item: StaffZoneListItem }) {
  if (item.mode === "quote") return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col text-xs">
      <span>{item.flatRateText}</span>
      {item.freeOverText && <span className="text-muted-foreground">Free over {item.freeOverText}</span>}
    </span>
  );
}

function Pills({ item }: { item: StaffZoneListItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusPill label={item.isActive ? "Active" : "Inactive"} colors={item.isActive ? ACTIVE_COLORS : INACTIVE_COLORS} />
      {item.isFallback && <StatusPill label="Rest of world" colors={FALLBACK_COLORS} />}
      {!item.isFallback && <ZoneActiveToggle id={item.id} isActive={item.isActive} />}
    </div>
  );
}

function ZoneRow({ item, total, backHref }: { item: StaffZoneListItem; total: number; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <tr onClick={() => router.push(href)} className="border-border hover:bg-secondary/50 cursor-pointer border-b last:border-b-0">
      <td className="text-muted-foreground px-3 py-2">{item.position}</td>
      <td className="px-3 py-2">
        <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
          {item.name}
        </Link>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{ZONE_MODE_LABELS[item.mode]}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <RateText item={item} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{item.codEnabled ? "On" : "Off"}</td>
      <td className="text-muted-foreground px-3 py-2 tabular-nums">{item.isFallback && item.areaCount === 0 ? "Everywhere else" : item.areaCount}</td>
      <td className="text-muted-foreground px-3 py-2 tabular-nums">{item.orderCount}</td>
      <td className="px-3 py-2">
        <div onClick={stop}>
          <Pills item={item} />
        </div>
      </td>
      <td className="px-3 py-2">
        <div onClick={stop}>
          <MoveToControl action={moveZoneAction} hiddenFields={{ id: item.id }} total={total} itemName={item.name} />
        </div>
      </td>
    </tr>
  );
}

function ZoneCard({ item, total, backHref }: { item: StaffZoneListItem; total: number; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <li onClick={() => router.push(href)} className="bg-card border-border cursor-pointer rounded-lg border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={href} onClick={stop} className="text-primary min-w-0 font-medium hover:underline">
          {item.name}
        </Link>
        <span className="text-muted-foreground shrink-0 text-xs">#{item.position}</span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {ZONE_MODE_LABELS[item.mode]}
        {item.flatRateText ? ` · ${item.flatRateText}` : ""}
        {item.freeOverText ? ` · free over ${item.freeOverText}` : ""} · COD {item.codEnabled ? "on" : "off"}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {item.isFallback && item.areaCount === 0 ? "Everywhere else" : `${item.areaCount} ${item.areaCount === 1 ? "area" : "areas"}`} · {item.orderCount} {item.orderCount === 1 ? "order" : "orders"}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2" onClick={stop}>
        <Pills item={item} />
        <MoveToControl action={moveZoneAction} hiddenFields={{ id: item.id }} total={total} itemName={item.name} />
      </div>
    </li>
  );
}

export function ZonesTable({ items, backHref }: { items: StaffZoneListItem[]; backHref: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No shipping zones yet.</p>;
  }

  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="rounded-l-lg px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Zone</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium">Flat rate</th>
                <th className="px-3 py-2 font-medium">COD</th>
                <th className="px-3 py-2 font-medium">Areas</th>
                <th className="px-3 py-2 font-medium">Orders</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="rounded-r-lg px-3 py-2 font-medium">Move</th>
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:pt-4">
              {items.map((item) => (
                <ZoneRow key={item.id} item={item} total={items.length} backHref={backHref} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map((item) => (
          <ZoneCard key={item.id} item={item} total={items.length} backHref={backHref} />
        ))}
      </ul>
    </>
  );
}
