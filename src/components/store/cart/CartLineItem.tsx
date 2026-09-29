"use client";

import Image from "next/image";
import Link from "next/link";
import { PriceTag } from "@/components/store/catalog/PriceTag";
import { QuantityStepper } from "@/components/store/QuantityStepper";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { CartQuoteLine } from "@/features/cart/quote";
import { useCart } from "./CartProvider";

/**
 * One cart line. The text column is sized to stay within the 96×120 thumbnail: a name of at
 * most two lines, one row for variant and unit price, and a compact stepper row pinned to the
 * bottom edge with the remove icon and the line total.
 */
export function CartLineItem({ line, onNavigate }: { line: CartQuoteLine; onNavigate?: () => void }) {
  const { pending, setQuantity, removeItem } = useCart();
  const href = `/product/${line.productSlug}`;

  return (
    <li className="flex gap-4 py-5">
      <Link href={href} onClick={onNavigate} className="bg-muted block h-30 w-24 shrink-0 overflow-hidden">
        {line.image && (
          <Image
            src={line.image.path}
            alt={line.image.alt ?? line.name}
            width={line.image.width}
            height={line.image.height}
            sizes="96px"
            className="h-full w-full object-cover"
          />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={href} onClick={onNavigate} className="hover:text-champagne line-clamp-2 font-serif text-lg leading-tight transition-colors">
          {line.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          {line.variantLabel && (
            <span className="text-muted-foreground text-[10px] tracking-[0.28em] uppercase">{line.variantLabel}</span>
          )}
          <PriceTag price={line.unitPrice} className="text-xs tracking-widest" />
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <QuantityStepper
              size="compact"
              value={line.quantity}
              max={line.maxQuantity}
              disabled={pending}
              onChange={(next) => setQuantity(line.variantId, next)}
            />
            <button
              type="button"
              aria-label={`Remove ${line.name}${line.variantLabel ? ` (${line.variantLabel})` : ""}`}
              disabled={pending}
              onClick={() => removeItem(line.variantId)}
              className="text-muted-foreground hover:text-destructive p-1.5 transition-colors disabled:opacity-40"
            >
              <Icon d={ICON_PATHS.trash} className="h-4 w-4" />
            </button>
          </div>
          <p className="shrink-0 text-sm tracking-widest">{line.lineTotal}</p>
        </div>
      </div>
    </li>
  );
}
