"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { ArchiveRestoreButton, FeaturedStarButton } from "@/components/panel/products/ProductRowActions";
import type { StaffProductListItem } from "@/features/catalog/products-staff-service";
import { formatMoney, decimalToPaisa } from "@/features/pricing/money";
import type { ProductStatus } from "@/features/catalog/schemas";
import { PILL_COLORS } from "@/lib/pill-colors";

const THUMB_SIZE = 40;

function Thumbnail({ imagePath, name }: { imagePath: string | null; name: string }) {
  if (!imagePath) {
    return (
      <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
        <Icon d={ICON_PATHS.box} className="h-4 w-4" />
      </div>
    );
  }
  return <Image src={imagePath} alt={name} width={THUMB_SIZE} height={THUMB_SIZE} className="h-10 w-10 shrink-0 rounded-md object-cover" />;
}

const STATUS_STYLES: Record<ProductStatus, { bg: string; text: string; dot: string; label: string }> = {
  active: { ...PILL_COLORS.emerald, label: "Active" },
  draft: { ...PILL_COLORS.amber, label: "Draft" },
  archived: { ...PILL_COLORS.muted, label: "Archived" },
};

function StatusPill({ status }: { status: ProductStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

/** Reuses the existing pricing module's discount resolution only — no new pricing logic here. */
function PriceCell({ price, salePrice }: { price: string; salePrice: StaffProductListItem["salePrice"] }) {
  if (!salePrice) return <>{formatMoney(decimalToPaisa(price))}</>;
  return (
    <span className="flex flex-col">
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-red-600 dark:text-red-400">{formatMoney(decimalToPaisa(salePrice.discounted))}</span>
        <span className="inline-flex items-center rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">On sale</span>
      </span>
      <span className="text-muted-foreground text-xs line-through">{formatMoney(decimalToPaisa(salePrice.original))}</span>
    </span>
  );
}

function detailHref(id: number, backHref: string): string {
  return `/panel/products/${id}?back=${encodeURIComponent(backHref)}`;
}

/** Stops a click reaching the row's own navigation (the name link and the quick actions). */
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

function ProductRow({ item, backHref }: { item: StaffProductListItem; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <tr onClick={() => router.push(href)} className="border-border hover:bg-secondary/50 cursor-pointer border-b last:border-b-0">
      <td className="text-muted-foreground px-3 py-2">{item.serial}</td>
      <td className="px-3 py-2">
        <Thumbnail imagePath={item.imagePath} name={item.name} />
      </td>
      <td className="px-3 py-2">
        <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
          {item.name}
        </Link>
      </td>
      <td className="text-muted-foreground px-3 py-2">{item.categoryName}</td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
        <PriceCell price={item.price} salePrice={item.salePrice} />
      </td>
      <td className={`px-3 py-2 ${item.stock === 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{item.stock}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1" onClick={stop}>
          <StatusPill status={item.status} />
          <ArchiveRestoreButton id={item.id} status={item.status} />
        </div>
      </td>
      <td className="px-3 py-2" onClick={stop}>
        <FeaturedStarButton id={item.id} isFeatured={item.isFeatured} />
      </td>
    </tr>
  );
}

function ProductCard({ item, backHref }: { item: StaffProductListItem; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <li onClick={() => router.push(href)} className="bg-card border-border cursor-pointer rounded-lg border p-3.5">
      <div className="flex items-start gap-3">
        <Thumbnail imagePath={item.imagePath} name={item.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
              {item.name}
            </Link>
            <div onClick={stop}>
              <FeaturedStarButton id={item.id} isFeatured={item.isFeatured} />
            </div>
          </div>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{item.categoryName}</p>
          <p className="text-sm font-medium">
            <PriceCell price={item.price} salePrice={item.salePrice} />
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between" onClick={stop}>
        <div className="flex items-center gap-1">
          <StatusPill status={item.status} />
          <ArchiveRestoreButton id={item.id} status={item.status} />
        </div>
        <span className={`text-xs ${item.stock === 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
          {item.stock} in stock
        </span>
      </div>
    </li>
  );
}

export function ProductsTable({ items, backHref }: { items: StaffProductListItem[]; backHref: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No products match this search.</p>;
  }

  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="rounded-l-lg px-3 py-2 font-medium">S.N</th>
                <th className="px-3 py-2 font-medium">Image</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="rounded-r-lg px-3 py-2 font-medium">Featured</th>
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:pt-4">
              {items.map((item) => (
                <ProductRow key={item.id} item={item} backHref={backHref} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map((item) => (
          <ProductCard key={item.id} item={item} backHref={backHref} />
        ))}
      </ul>
    </>
  );
}
