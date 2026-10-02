import Link from "next/link";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import type { SaleInfo } from "@/features/catalog/products-staff-service";

/** The back chevron + title row shared by the new/edit product pages (mirrors the category form header). */
export function ProductFormHeader({ title, backHref, salePrice, variantCount }: { title: string; backHref: string; salePrice?: SaleInfo; variantCount?: number }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <Link
        href={backHref}
        aria-label="Back to products"
        className="text-muted-foreground hover:bg-secondary hover:text-foreground -ml-1.5 shrink-0 rounded-md p-1.5"
      >
        <Icon d={ICON_PATHS.chevronLeft} className="h-4 w-4" />
      </Link>
      <h1 className="text-base font-semibold">{title}</h1>
      {variantCount !== undefined && (
        <span className="text-muted-foreground text-xs">
          · {variantCount} {variantCount === 1 ? "variant" : "variants"}
        </span>
      )}
      {salePrice && (
        <span className="flex items-center gap-1.5 text-xs">
          <span className="font-medium text-red-600 dark:text-red-400">{formatMoney(decimalToPaisa(salePrice.discounted))}</span>
          <span className="text-muted-foreground line-through">{formatMoney(decimalToPaisa(salePrice.original))}</span>
          <span className="inline-flex items-center rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">On sale</span>
        </span>
      )}
    </div>
  );
}
