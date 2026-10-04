"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { Switch } from "@/components/panel/Switch";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { variantInputSchema } from "@/features/catalog/schemas";
import { MAX_VARIANT_ATTRIBUTES, SUGGESTED_ATTRIBUTE_NAMES, generateVariantLabel, validateAttributePairs } from "@/features/catalog/variants";
import type { PanelVariant } from "@/features/catalog/variants-staff-service";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { createVariantAction, updateVariantAction } from "@/app/panel/(protected)/products/[id]/actions";

type AttributeRow = { rowId: number; key: string; value: string };

const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function rowsFrom(attributes: Record<string, string>): AttributeRow[] {
  const rows = Object.entries(attributes).map(([key, value], index) => ({ rowId: index, key, value }));
  return rows.length > 0 ? rows : [{ rowId: 0, key: "", value: "" }];
}

/**
 * Add/Edit a variant (S10): its own `<form>` inside a `Dialog`, rendered by the variants
 * card outside the product save form. Attribute rows post as `attributeKey{i}`/`attributeValue{i}`;
 * the label follows the attribute values ("Red / Large") until the Developer edits it. The shared
 * `variantInputSchema` runs here first (field errors without a round trip) and again in the
 * Server Action, which also applies the SKU-unique and same-attributes rules under the row lock.
 */
export function VariantDialog({
  mode,
  productId,
  productPrice,
  variant,
  onClose,
}: {
  mode: "add" | "edit";
  productId: number;
  productPrice: string;
  variant?: PanelVariant;
  onClose: () => void;
}) {
  const router = useRouter();
  const { state, formAction, pending } = useStaffAction(mode === "add" ? createVariantAction : updateVariantAction, () => {
    onClose();
    router.refresh();
  });
  const [rows, setRows] = useState<AttributeRow[]>(() => rowsFrom(variant?.attributes ?? {}));
  const nextRowId = useRef(rows.length);
  const [label, setLabel] = useState(variant?.label ?? "");
  // Keeps auto-generating until the label is typed in (or already differs from what the attributes would generate).
  const labelTouched = useRef(variant !== undefined && variant.label !== generateVariantLabel(variant.attributes));
  const [isActive, setIsActive] = useState(variant?.isActive ?? true);
  const [clientErrors, setClientErrors] = useState<Record<string, string> | null>(null);

  const fieldErrors = clientErrors ?? (state && !state.ok ? state.fieldErrors : undefined);
  const formError = !clientErrors && state && !state.ok && !state.fieldErrors ? state.error : undefined;

  function syncLabel(nextRows: AttributeRow[]) {
    if (labelTouched.current) return;
    setLabel(generateVariantLabel(validateAttributePairs(nextRows).attributes));
  }

  function updateRow(rowId: number, patch: Partial<Pick<AttributeRow, "key" | "value">>) {
    const nextRows = rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row));
    setRows(nextRows);
    syncLabel(nextRows);
  }

  function removeRow(rowId: number) {
    const nextRows = rows.filter((row) => row.rowId !== rowId);
    setRows(nextRows.length > 0 ? nextRows : [{ rowId: nextRowId.current++, key: "", value: "" }]);
    syncLabel(nextRows);
  }

  function addRow() {
    if (rows.length >= MAX_VARIANT_ATTRIBUTES) return;
    setRows([...rows, { rowId: nextRowId.current++, key: "", value: "" }]);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const parsed = variantInputSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (parsed.success) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    setClientErrors(fieldErrorsOf(parsed.error));
  }

  const usedNames = new Set(rows.map((row) => row.key.trim().toLowerCase()));

  return (
    <Dialog open onClose={onClose} title={mode === "add" ? "Add variant" : `Edit “${variant?.label}”`} widthClassName="max-w-lg">
      <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-5">
        {mode === "add" ? <input type="hidden" name="productId" value={productId} /> : <input type="hidden" name="variantId" value={variant?.id ?? ""} />}

        {/* A bordered box groups the attribute rows as one visual unit, separate from the plain fields below. `min-w-0`: a fieldset defaults to `min-width: min-content`, which let two inputs + a button push it past the dialog at 375px. */}
        <fieldset className="border-border bg-secondary/20 flex min-w-0 flex-col gap-2.5 rounded-lg border p-3">
          <legend className="text-sm font-medium">Attributes</legend>
          <p className="text-muted-foreground -mt-1 text-xs">What makes this variant different, e.g. Colour: Red. Leave empty for a single default variant.</p>
          {rows.map((row, index) => {
            const keyError = fieldErrors?.[`attributeKey${index}`];
            const valueError = fieldErrors?.[`attributeValue${index}`];
            const suggestions = row.key === "" ? SUGGESTED_ATTRIBUTE_NAMES.filter((name) => !usedNames.has(name.toLowerCase())) : [];
            return (
              <div key={row.rowId} className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
                    <input
                      name={`attributeKey${index}`}
                      value={row.key}
                      onChange={(event) => updateRow(row.rowId, { key: event.target.value })}
                      placeholder="Name"
                      maxLength={40}
                      aria-label={`Attribute ${index + 1} name`}
                      className={`${inputClass} bg-background w-full px-2 py-1.5 sm:w-28 sm:shrink-0`}
                    />
                    <input
                      name={`attributeValue${index}`}
                      value={row.value}
                      onChange={(event) => updateRow(row.rowId, { value: event.target.value })}
                      placeholder="Value"
                      maxLength={80}
                      aria-label={`Attribute ${index + 1} value`}
                      className={`${inputClass} bg-background min-w-0 flex-1 px-2 py-1.5`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.rowId)}
                    aria-label={`Remove attribute ${index + 1}`}
                    className="text-muted-foreground hover:bg-secondary hover:text-foreground shrink-0 rounded-md p-1.5"
                  >
                    <Icon d={ICON_PATHS.close} className="h-3.5 w-3.5" />
                  </button>
                </div>
                {suggestions.length > 0 && (
                  <span className="flex flex-wrap gap-1 sm:pl-[7.5rem]">
                    {suggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => updateRow(row.rowId, { key: name })}
                        className="bg-secondary text-secondary-foreground hover:bg-secondary/70 rounded-full px-2 py-0.5 text-[10px]"
                      >
                        {name}
                      </button>
                    ))}
                  </span>
                )}
                {(keyError || valueError) && <p className="text-destructive text-xs">{keyError ?? valueError}</p>}
              </div>
            );
          })}
          {rows.length < MAX_VARIANT_ATTRIBUTES && (
            <button type="button" onClick={addRow} className="text-primary self-start text-xs font-medium hover:underline">
              + Add attribute
            </button>
          )}
        </fieldset>

        <Field id="variant-label" label="Label" error={fieldErrors?.label} hint="Shown to customers in the picker and on orders. Generated from the attributes until you edit it.">
          <input
            id="variant-label"
            name="label"
            value={label}
            onChange={(event) => {
              labelTouched.current = true;
              setLabel(event.target.value);
            }}
            maxLength={150}
            className={inputClass}
          />
        </Field>

        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="flex-1">
            <Field id="variant-sku" label="SKU" error={fieldErrors?.sku}>
              <input id="variant-sku" name="sku" defaultValue={variant?.sku ?? ""} required maxLength={64} className={`${inputClass} w-full font-mono`} />
            </Field>
          </div>
          <div className="w-full sm:w-28 sm:shrink-0">
            <Field id="variant-stock" label="Stock" error={fieldErrors?.stock}>
              <input id="variant-stock" name="stock" type="number" defaultValue={variant?.stock ?? 0} min={0} step={1} required className={`${inputClass} w-full`} />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="flex-1">
            <Field id="variant-price" label="Price override (PKR)" error={fieldErrors?.priceOverride} hint={`Blank = product price (${formatMoney(decimalToPaisa(productPrice))}).`}>
              <input id="variant-price" name="priceOverride" defaultValue={variant?.priceOverride ?? ""} inputMode="decimal" className={`${inputClass} w-full`} />
            </Field>
          </div>
          <div className="w-full sm:w-36 sm:shrink-0">
            <Field id="variant-weight" label="Weight override (g)" error={fieldErrors?.weightGrams} hint="Blank = product's weight.">
              <input id="variant-weight" name="weightGrams" type="number" defaultValue={variant?.weightGrams ?? ""} min={0} step={1} className={`${inputClass} w-full`} />
            </Field>
          </div>
        </div>

        <div className="bg-secondary/20 flex items-center justify-between gap-2 rounded-lg px-3 py-2.5">
          <span className="text-sm font-medium">Active</span>
          <Switch name="isActive" checked={isActive} onChange={setIsActive} />
        </div>

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <div className="border-border -mx-5 -mb-4 flex justify-end gap-2 border-t px-5 pt-3">
          <button type="button" onClick={onClose} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            {pending ? "Saving…" : mode === "add" ? "Add variant" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
