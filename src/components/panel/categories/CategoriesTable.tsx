"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { StaffCategoryListItem } from "@/features/catalog/staff-service";

const THUMB_SIZE = 40;

function Thumbnail({ imagePath, name }: { imagePath: string | null; name: string }) {
  if (!imagePath) {
    return (
      <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
        <Icon d={ICON_PATHS.tag} className="h-4 w-4" />
      </div>
    );
  }
  return (
    <Image
      src={imagePath}
      alt={name}
      width={THUMB_SIZE}
      height={THUMB_SIZE}
      className="h-10 w-10 shrink-0 rounded-md object-cover"
    />
  );
}

function StatusPill({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  ) : (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
      <span className="bg-muted-foreground/60 h-1.5 w-1.5 rounded-full" />
      Hidden
    </span>
  );
}

function detailHref(id: number, backHref: string): string {
  return `/panel/categories/${id}?back=${encodeURIComponent(backHref)}`;
}

/** Stops a click reaching the row's own navigation (the name link). */
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

function CategoryRow({ item, backHref }: { item: StaffCategoryListItem; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);
  const isChild = item.parentName !== null;

  return (
    <tr onClick={() => router.push(href)} className="border-border hover:bg-secondary/50 cursor-pointer border-b last:border-b-0">
      <td className="text-muted-foreground px-3 py-2">{item.serial}</td>
      <td className="px-3 py-2">
        <Thumbnail imagePath={item.imagePath} name={item.name} />
      </td>
      <td className={`px-3 py-2 ${isChild ? "pl-8" : ""}`}>
        <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
          {isChild && <span className="text-muted-foreground mr-1">↳</span>}
          {item.name}
        </Link>
        {isChild && <p className="text-muted-foreground text-xs">{item.parentName}</p>}
      </td>
      <td className="text-muted-foreground px-3 py-2">{item.slug}</td>
      <td className="text-muted-foreground px-3 py-2">{item.productCount}</td>
      <td className="text-muted-foreground px-3 py-2">{item.sortOrder}</td>
      <td className="px-3 py-2">
        <StatusPill isActive={item.isActive} />
      </td>
    </tr>
  );
}

function CategoryCard({ item, backHref }: { item: StaffCategoryListItem; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <li onClick={() => router.push(href)} className="bg-card border-border cursor-pointer rounded-lg border p-3.5">
      <div className="flex items-start gap-3">
        <Thumbnail imagePath={item.imagePath} name={item.name} />
        <div className="min-w-0 flex-1">
          <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
            {item.name}
          </Link>
          {item.parentName && <p className="text-muted-foreground mt-0.5 truncate text-xs">Under {item.parentName}</p>}
          <p className="text-muted-foreground text-xs">{item.slug}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between" onClick={stop}>
        <StatusPill isActive={item.isActive} />
        <span className="text-muted-foreground text-xs">
          {item.productCount} product{item.productCount === 1 ? "" : "s"} · sort {item.sortOrder}
        </span>
      </div>
    </li>
  );
}

export function CategoriesTable({ items, backHref }: { items: StaffCategoryListItem[]; backHref: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No categories match this search.</p>;
  }

  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="rounded-l-lg px-3 py-2 font-medium">S.N</th>
                <th className="px-3 py-2 font-medium">Image</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Products</th>
                <th className="px-3 py-2 font-medium">Sort</th>
                <th className="rounded-r-lg px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:pt-4">
              {items.map((item) => (
                <CategoryRow key={item.id} item={item} backHref={backHref} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map((item) => (
          <CategoryCard key={item.id} item={item} backHref={backHref} />
        ))}
      </ul>
    </>
  );
}
