import Link from "next/link";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

/**
 * The back chevron + title row shared by the panel's new/edit pages (categories, products,
 * discounts, coupons), mirroring the wholesale/order detail pages. `children` sits after the
 * title for small inline meta (a sale price, a variant count, a status pill).
 */
export function PanelFormHeader({ title, backHref, backLabel, children }: { title: string; backHref: string; backLabel: string; children?: React.ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <Link href={backHref} aria-label={backLabel} className="text-muted-foreground hover:bg-secondary hover:text-foreground -ml-1.5 shrink-0 rounded-md p-1.5">
        <Icon d={ICON_PATHS.chevronLeft} className="h-4 w-4" />
      </Link>
      <h1 className="text-base font-semibold">{title}</h1>
      {children}
    </div>
  );
}
