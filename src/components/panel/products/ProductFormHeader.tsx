import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import type { SaleInfo } from "@/features/catalog/products-staff-readers";

/** The back chevron + title row shared by the new/edit product pages, plus the variant count and the read-only "On sale" price. */
export function ProductFormHeader({ title, backHref, salePrice, variantCount }: { title: string; backHref: string; salePrice?: SaleInfo; variantCount?: number }) {
  return (
    <PanelFormHeader title={title} backHref={backHref} backLabel="Back to products">
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
    </PanelFormHeader>
  );
}
