"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoveToControl } from "@/components/panel/MoveToControl";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { PanelVariant } from "@/features/catalog/variants-staff-service";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { moveVariantAction, setVariantActiveAction, setVariantStockAction } from "@/app/panel/(protected)/products/[id]/actions";

/**
 * One grid for the header row and every variant row (md+); below md each row stacks into a card.
 * Each `<li>` is its own grid, so every column but the flexible Variant one has a fixed width —
 * that's what keeps the columns aligned from row to row (an `auto` or `fr` column would size per row).
 * The actions column stays narrow because its buttons are icon-only (edit/toggle/delete) plus the
 * move control, rather than full labelled buttons — that's also what gives the Variant column (and
 * the row as a whole, on a real laptop width) room to breathe instead of running tight.
 */
export const VARIANT_GRID = "md:grid md:grid-cols-[1.25rem_1.5rem_minmax(0,1fr)_7rem_7rem_4rem_5rem_15rem] md:items-center md:gap-x-3";

const cellLabel = "text-muted-foreground text-[10px] font-medium uppercase tracking-wide md:hidden";
/** Below md, each stat gets its own small chip so the row reads as a tidy 2x2 grid instead of wrapped, ragged lines. */
const cellBox = "bg-muted/40 flex min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 md:flex-row md:items-center md:gap-1.5 md:rounded-none md:bg-transparent md:px-0 md:py-0";

const iconButtonBase = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50";
const iconButtonMuted = `${iconButtonBase} text-muted-foreground hover:bg-secondary hover:text-foreground`;
const iconButtonDestructive = `${iconButtonBase} text-destructive hover:bg-destructive/10`;

function AttributeChips({ attributes }: { attributes: Record<string, string> }) {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span key={key} className="bg-secondary text-secondary-foreground inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px]">
          {key}: {value}
        </span>
      ))}
    </span>
  );
}

function ActivePill({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  ) : (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
      <span className="bg-muted-foreground/60 h-1.5 w-1.5 rounded-full" />
      Inactive
    </span>
  );
}

/** The variant's own override, or the product price muted when it has none. */
function PriceCell({ priceOverride, productPrice }: { priceOverride: string | null; productPrice: string }) {
  if (priceOverride === null) return <span className="text-muted-foreground">{formatMoney(decimalToPaisa(productPrice))}</span>;
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-medium">{formatMoney(decimalToPaisa(priceOverride))}</span>
      <span className="text-muted-foreground text-[10px]">override</span>
    </span>
  );
}

/** The inline "adjust stock" control: a Save button appears as soon as the number differs from what's saved. */
function StockAdjust({ variant, onError }: { variant: PanelVariant; onError: (message: string | null) => void }) {
  const router = useRouter();
  const { state, formAction, pending } = useStaffAction(setVariantStockAction, () => router.refresh());
  const [value, setValue] = useState(String(variant.stock));
  // Resyncs to fresh server data (a save here, or another row's action refreshing the page).
  const [renderedStock, setRenderedStock] = useState(variant.stock);
  if (variant.stock !== renderedStock) {
    setRenderedStock(variant.stock);
    setValue(String(variant.stock));
  }
  const changed = value.trim() !== String(variant.stock);
  const error = state && !state.ok ? (state.fieldErrors?.stock ?? state.error) : null;
  // Surfaces a server refusal on the row's own error line, not inside this narrow cell.
  useEffect(() => onError(error), [error, onError]);

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="variantId" value={variant.id} />
      <input
        type="number"
        name="stock"
        min={0}
        step={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`Stock for ${variant.label}`}
        className={`border-input bg-background w-14 rounded-md border px-1.5 py-1 text-xs tabular-nums ${variant.stock === 0 && !changed ? "font-medium text-red-600 dark:text-red-400" : ""}`}
      />
      {changed && (
        <button type="submit" disabled={pending} className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50">
          {pending ? "…" : "Save"}
        </button>
      )}
    </form>
  );
}

/** The Activate/Deactivate quick action: an icon button (a power glyph) rather than a labelled one — see the actions column's icon-only convention above. */
function ActiveToggle({ variant, onError }: { variant: PanelVariant; onError: (message: string | null) => void }) {
  const router = useRouter();
  const { state, formAction, pending } = useStaffAction(setVariantActiveAction, () => router.refresh());
  const error = state && !state.ok ? state.error : null;
  useEffect(() => onError(error), [error, onError]);
  const label = variant.isActive ? "Deactivate" : "Activate";

  return (
    <form action={formAction}>
      <input type="hidden" name="variantId" value={variant.id} />
      <input type="hidden" name="isActive" value={variant.isActive ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${label} ${variant.label}`}
        title={label}
        className={variant.isActive ? `${iconButtonBase} text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400` : iconButtonMuted}
      >
        {pending ? <span className="text-xs">…</span> : <Icon d={ICON_PATHS.power} className="h-4 w-4" />}
      </button>
    </form>
  );
}

export function VariantRow({
  variant,
  productPrice,
  total,
  onEdit,
  onDelete,
}: {
  variant: PanelVariant;
  productPrice: string;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: variant.id });
  const [rowError, setRowError] = useState<string | null>(null);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-card border-border flex flex-col gap-3 rounded-lg border p-3 text-sm md:py-2.5 ${VARIANT_GRID} ${isDragging ? "opacity-60" : ""}`}
    >
      {/* Below md these wrappers lay the cells out in three rows; at md `contents` dissolves them into the grid's columns, in DOM order. */}
      <div className="flex items-center gap-2 md:contents">
        <button type="button" {...attributes} {...listeners} aria-label={`Drag to reorder ${variant.label}`} className="text-muted-foreground hover:text-foreground -ml-1 shrink-0 cursor-grab touch-none p-1 active:cursor-grabbing">
          <Icon d={ICON_PATHS.grip} className="h-4 w-4" />
        </button>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{variant.position}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`truncate font-medium ${variant.isActive ? "" : "text-muted-foreground"}`} title={variant.label}>
            {variant.label}
          </span>
          <AttributeChips attributes={variant.attributes} />
          <span className="text-muted-foreground truncate font-mono text-xs">{variant.sku}</span>
        </div>
      </div>

      {/* A tidy 2x2 grid of stat chips on phones (fixed cells, not wrapped flex items of varying width); at md each cell is its own plain grid column. */}
      <div className="grid grid-cols-2 gap-1.5 md:contents">
        <span className={cellBox}>
          <span className={cellLabel}>Price</span>
          <PriceCell priceOverride={variant.priceOverride} productPrice={productPrice} />
        </span>
        <span className={cellBox}>
          <span className={cellLabel}>Stock</span>
          <StockAdjust variant={variant} onError={setRowError} />
        </span>
        <span className={cellBox}>
          <span className={cellLabel}>Weight</span>
          <span className="text-muted-foreground text-xs">{variant.weightGrams === null ? "—" : `${variant.weightGrams} g`}</span>
        </span>
        <span className={cellBox}>
          <span className={cellLabel}>Status</span>
          <ActivePill isActive={variant.isActive} />
        </span>
      </div>

      {/* One child here (the row below): the md:contents wrapper must dissolve into exactly one
          grid cell (the actions column) — splitting this into two direct children would push the
          second one onto a new implicit grid row instead of sharing this column. */}
      <div className="md:contents">
        <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
          {/* Icon-only quick actions (edit/toggle/delete) keep this group — and the whole actions column at md+ — narrow; Move gets its own wrap point. */}
          <div className="flex items-center gap-1">
            <button type="button" onClick={onEdit} aria-label={`Edit ${variant.label}`} title="Edit" className={iconButtonMuted}>
              <Icon d={ICON_PATHS.edit} className="h-4 w-4" />
            </button>
            <ActiveToggle variant={variant} onError={setRowError} />
            <button type="button" onClick={onDelete} aria-label={`Delete ${variant.label}`} title="Delete" className={iconButtonDestructive}>
              <Icon d={ICON_PATHS.trash} className="h-4 w-4" />
            </button>
          </div>
          <MoveToControl action={moveVariantAction} hiddenFields={{ variantId: variant.id }} total={total} itemName={variant.label} />
        </div>
      </div>

      {rowError && <p className="text-destructive text-xs md:col-span-8">{rowError}</p>}
    </li>
  );
}
