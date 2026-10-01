"use client";

import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { TextField } from "@/components/store/forms/fields";

export type WholesaleItemRow = { itemName: string; quantity: string; note: string };

export const EMPTY_ITEM_ROW: WholesaleItemRow = { itemName: "", quantity: "1", note: "" };
const MAX_ROWS = 20;

// Matches components/store/forms/fields.tsx's unlabelled control: row 2+ skip the label line
// entirely (an empty one would still show the "(optional)" suffix with nothing to attach it to).
const ROW_CONTROL =
  "border-espresso/30 focus:border-espresso placeholder:text-muted-foreground w-full border-b bg-transparent py-3 text-sm outline-none transition-colors";

/** Repeatable item rows (REQUIREMENTS SF-08): add up to 20, remove down to 1. */
export function WholesaleItemRows({
  rows,
  onChange,
  error,
}: {
  rows: WholesaleItemRow[];
  onChange: (rows: WholesaleItemRow[]) => void;
  error?: string | null;
}) {
  function update(index: number, patch: Partial<WholesaleItemRow>) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="grid gap-5">
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_6rem_auto] items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          {index === 0 ? (
            <>
              <TextField
                id="item-name-0"
                label="Item"
                required
                placeholder="e.g. Dinner plates"
                value={row.itemName}
                onChange={(event) => update(index, { itemName: event.target.value })}
                className="col-span-2 sm:col-span-1"
              />
              <TextField
                id="item-quantity-0"
                label="Quantity"
                type="number"
                min={1}
                max={100_000}
                required
                value={row.quantity}
                onChange={(event) => update(index, { quantity: event.target.value })}
              />
              <TextField
                id="item-note-0"
                label="Note"
                placeholder="Optional"
                value={row.note}
                onChange={(event) => update(index, { note: event.target.value })}
                className="col-span-2 sm:col-span-1"
              />
            </>
          ) : (
            <>
              <input
                id={`item-name-${index}`}
                aria-label="Item"
                placeholder="e.g. Dinner plates"
                value={row.itemName}
                onChange={(event) => update(index, { itemName: event.target.value })}
                className={`${ROW_CONTROL} col-span-2 sm:col-span-1`}
              />
              <input
                id={`item-quantity-${index}`}
                aria-label="Quantity"
                type="number"
                min={1}
                max={100_000}
                value={row.quantity}
                onChange={(event) => update(index, { quantity: event.target.value })}
                className={ROW_CONTROL}
              />
              <input
                id={`item-note-${index}`}
                aria-label="Note"
                placeholder="Optional"
                value={row.note}
                onChange={(event) => update(index, { note: event.target.value })}
                className={`${ROW_CONTROL} col-span-2 sm:col-span-1`}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => remove(index)}
            disabled={rows.length <= 1}
            aria-label="Remove item"
            className="text-muted-foreground hover:text-destructive mb-3 shrink-0 p-1 disabled:pointer-events-none disabled:opacity-30"
          >
            <Icon d={ICON_PATHS.trash} className="h-4 w-4" />
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-destructive text-xs leading-relaxed">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => onChange([...rows, { ...EMPTY_ITEM_ROW }])}
        disabled={rows.length >= MAX_ROWS}
        className="border-espresso/30 hover:border-espresso w-fit border px-5 py-2.5 text-[10px] tracking-[0.28em] uppercase transition-colors disabled:pointer-events-none disabled:opacity-40"
      >
        Add another item
      </button>
    </div>
  );
}
