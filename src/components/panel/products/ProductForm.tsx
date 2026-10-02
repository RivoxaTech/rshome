"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateSlug } from "@/features/catalog/slug";
import { PLACEMENT_CREATE, PLACEMENT_EDIT, PRODUCT_STATUSES, type PlacementCreate, type PlacementEdit, type ProductStatus } from "@/features/catalog/schemas";
import type { CategoryGroup, ProductVariantRow } from "@/features/catalog/products-staff-repo";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { decimalToPaisa, percentPriceChange } from "@/features/pricing/money";
import { Listbox, type ListboxItem } from "@/components/panel/Listbox";
import { MediaImageField } from "@/components/panel/MediaImageField";
import { Switch } from "@/components/panel/Switch";

export type ProductFormValues = {
  id: number | null;
  name: string;
  slug: string;
  categoryId: number | null;
  shortDescription: string | null;
  description: string | null;
  price: string;
  weightGrams: number | null;
  status: ProductStatus;
  isFeatured: boolean;
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

export type DefaultVariantFormValues = { sku: string; stock: number; priceOverride: string | null };

const STATUS_LABELS: Record<ProductStatus, string> = { draft: "Draft", active: "Active", archived: "Archived" };

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

/** The product's current position in the relevant order; `current` is null on create, and on edit while not yet featured. */
export type PlacementPosition = { current: number | null; total: number };

const PLACEMENT_LABELS: Record<PlacementCreate, string> = { top: "At the top", end: "At the end", position: "At position" };

/**
 * One "Show in shop"/"Show in featured strip" radio group (S10 phase 2b). On create, End is the
 * default and there's no "keep" option; on edit, "Keep current position" is the default so saving
 * the rest of the form never silently moves the product. The position number input only posts
 * when "At position" is selected — a disabled input isn't included in FormData.
 */
function PlacementField({
  legend,
  fieldPrefix,
  mode,
  position,
  error,
}: {
  legend: string;
  fieldPrefix: "shop" | "featured";
  mode: "create" | "edit";
  position: PlacementPosition;
  error?: string;
}) {
  const options: readonly (PlacementCreate | PlacementEdit)[] = mode === "edit" ? PLACEMENT_EDIT : PLACEMENT_CREATE;
  const defaultValue: PlacementCreate | PlacementEdit = mode === "edit" ? "keep" : "end";
  const [value, setValue] = useState<PlacementCreate | PlacementEdit>(defaultValue);
  const placementName = `${fieldPrefix}Placement`;
  const positionName = `${fieldPrefix}Position`;
  // A new row (create), or this row being newly added to a list it wasn't in before (edit), goes
  // after everything currently there, so the position field's default/max account for that extra slot.
  const maxPosition = position.current !== null ? position.total : position.total + 1;

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-col gap-1.5">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={placementName}
              value={option}
              defaultChecked={option === defaultValue}
              onChange={() => setValue(option)}
              className="accent-primary"
            />
            {option === "keep" ? `Keep current position${position.current ? ` (${position.current} of ${position.total})` : ""}` : PLACEMENT_LABELS[option]}
            {option === "position" && (
              <input
                type="number"
                name={positionName}
                min={1}
                max={maxPosition}
                defaultValue={position.current ?? maxPosition}
                disabled={value !== "position"}
                aria-label={`${legend} position`}
                className={`${inputClass} w-16 px-2 py-1 disabled:opacity-40`}
              />
            )}
          </label>
        ))}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </fieldset>
  );
}

export function ProductForm({
  mode,
  initial,
  categoryGroups,
  variant,
  multipleVariantsSummary,
  shopPosition,
  featuredPosition,
  action,
  backHref,
  actionsSlot,
}: {
  mode: "create" | "edit";
  initial: ProductFormValues;
  categoryGroups: CategoryGroup[];
  /** The one default variant's editable fields — present on create, and on edit while it's still the only variant. */
  variant: DefaultVariantFormValues | null;
  /** More than one variant (the 8 seeded samples): a read-only summary instead of inline fields. */
  multipleVariantsSummary: ProductVariantRow[] | null;
  /** Current shop-order position (`current` is null on create). */
  shopPosition: PlacementPosition;
  /** Current featured-order position (`current` is null on create, or on edit while not yet featured). */
  featuredPosition: PlacementPosition;
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  /** Where Cancel returns to: the products list, with the search/tab/page/rows the user came from. */
  backHref: string;
  /** The edit page's archive/restore quick action + delete dialog; absent in create mode. */
  actionsSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const priceConfirmedRef = useRef(false);

  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const slugTouched = useRef(mode === "edit");
  const [price, setPrice] = useState(initial.price);
  const [isFeatured, setIsFeatured] = useState(initial.isFeatured);
  const [status, setStatus] = useState<ProductStatus>(initial.status);
  const [categoryId, setCategoryId] = useState(initial.categoryId !== null ? String(initial.categoryId) : "");
  const [priceConfirm, setPriceConfirm] = useState<{ oldPaisa: number; newPaisa: number; percent: number } | null>(null);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (mode !== "edit" || priceConfirmedRef.current) return;
    const oldPaisa = decimalToPaisa(initial.price);
    const newPaisa = decimalToPaisa(price);
    if (Number.isNaN(newPaisa)) return;
    const percent = percentPriceChange(oldPaisa, newPaisa);
    if (percent !== null && Math.abs(percent) > 50) {
      event.preventDefault();
      setPriceConfirm({ oldPaisa, newPaisa, percent });
    }
  }

  function confirmPriceChange() {
    priceConfirmedRef.current = true;
    setPriceConfirm(null);
    formRef.current?.requestSubmit();
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "edit" && <input type="hidden" name="id" value={initial.id ?? ""} />}

        <Field id="name" label="Name" error={fieldErrors?.name}>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(event) => {
              const value = event.target.value;
              setName(value);
              if (!slugTouched.current) setSlug(generateSlug(value));
            }}
            required
            maxLength={150}
            className={inputClass}
          />
        </Field>

        <Field id="slug" label="Slug" error={fieldErrors?.slug}>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(event) => {
              slugTouched.current = true;
              setSlug(event.target.value);
            }}
            required
            maxLength={191}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className={`${inputClass} font-mono`}
          />
          <p className="text-muted-foreground text-xs">Lowercase letters, numbers and single dashes, e.g. ceramic-vase.</p>
        </Field>

        <Field id="categoryId" label="Category" error={fieldErrors?.categoryId}>
          <Listbox
            id="categoryId"
            name="categoryId"
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Choose a category"
            ariaLabel="Category"
            items={categoryGroups.flatMap((group): ListboxItem[] => {
              const options = group.options.map((option) => ({ value: String(option.id), label: option.name }));
              return group.parent ? [{ groupLabel: group.parent.name }, ...options] : options;
            })}
          />
        </Field>

        <Field id="shortDescription" label="Short description" error={fieldErrors?.shortDescription}>
          <textarea id="shortDescription" name="shortDescription" defaultValue={initial.shortDescription ?? ""} rows={2} maxLength={500} className={inputClass} />
          <p className="text-muted-foreground text-xs">Shown on listing cards. Up to 500 characters.</p>
        </Field>

        <Field id="description" label="Description" error={fieldErrors?.description}>
          <textarea id="description" name="description" defaultValue={initial.description ?? ""} rows={6} maxLength={5000} className={inputClass} />
        </Field>

        <MediaImageField
          name="imagePath"
          subdir="products"
          initialPath={initial.imagePath}
          initialWidth={initial.imageWidth}
          initialHeight={initial.imageHeight}
          helpText="WebP, up to 8 MB. The product's main photo (more photos and reordering arrive in phase 3)."
          error={fieldErrors?.imagePath}
        />

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="price" label="Price (PKR)" error={fieldErrors?.price}>
              <input
                id="price"
                name="price"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                required
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field id="weightGrams" label="Weight (grams)" error={fieldErrors?.weightGrams}>
              <input id="weightGrams" name="weightGrams" type="number" defaultValue={initial.weightGrams ?? ""} min={0} step={1} className={inputClass} />
              <p className="text-muted-foreground text-xs">Optional.</p>
            </Field>
          </div>
        </div>

        {priceConfirm && (
          <div className="border-amber-500/40 bg-amber-500/10 flex flex-col gap-2 rounded-md border p-3 text-sm">
            <p>
              That&apos;s a {Math.abs(priceConfirm.percent).toFixed(0)}% {priceConfirm.percent > 0 ? "increase" : "decrease"} — from{" "}
              <span className="font-medium">{(priceConfirm.oldPaisa / 100).toLocaleString("en-PK")}</span> to{" "}
              <span className="font-medium">{(priceConfirm.newPaisa / 100).toLocaleString("en-PK")}</span> PKR. Is that right?
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={confirmPriceChange} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium">
                Yes, save this price
              </button>
              <button type="button" onClick={() => setPriceConfirm(null)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </div>
        )}

        <Field id="status" label="Status" error={fieldErrors?.status}>
          <Listbox
            id="status"
            name="status"
            value={status}
            onChange={(value) => setStatus(value as ProductStatus)}
            ariaLabel="Status"
            items={PRODUCT_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
          />
          <p className="text-muted-foreground text-xs">Draft stays off the storefront; Archived hides it but keeps it on past orders.</p>
        </Field>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Featured</span>
          <Switch name="isFeatured" checked={isFeatured} onChange={setIsFeatured} />
        </div>

        <div className="border-border flex flex-col gap-4 border-t pt-4">
          <PlacementField legend="Show in shop" fieldPrefix="shop" mode={mode} position={shopPosition} error={fieldErrors?.shopPosition} />
          {isFeatured && <PlacementField legend="Show in featured strip" fieldPrefix="featured" mode={mode} position={featuredPosition} error={fieldErrors?.featuredPosition} />}
        </div>

        <div className="border-border flex flex-col gap-3 border-t pt-4">
          <h2 className="text-sm font-semibold">Default variant</h2>
          {variant ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <Field id="sku" label="SKU" error={fieldErrors?.sku}>
                  <input id="sku" name="sku" defaultValue={variant.sku} required maxLength={64} className={`${inputClass} font-mono`} />
                </Field>
              </div>
              <div className="flex-1">
                <Field id="stock" label="Stock" error={fieldErrors?.stock}>
                  <input id="stock" name="stock" type="number" defaultValue={variant.stock} min={0} step={1} required className={inputClass} />
                </Field>
              </div>
            </div>
          ) : null}
          {mode === "edit" && variant && (
            <Field id="priceOverride" label="Price override (PKR)" error={fieldErrors?.priceOverride}>
              <input id="priceOverride" name="priceOverride" defaultValue={variant.priceOverride ?? ""} inputMode="decimal" className={inputClass} />
              <p className="text-muted-foreground text-xs">Leave blank to use the product price above.</p>
            </Field>
          )}
          {multipleVariantsSummary && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs">This product has {multipleVariantsSummary.length} variants. Manage variants in phase 3.</p>
              <ul className="border-border divide-border flex flex-col divide-y rounded-md border text-sm">
                {multipleVariantsSummary.map((row) => (
                  <li key={row.id} className="flex items-center justify-between px-3 py-2">
                    <span>{row.label}</span>
                    <span className="text-muted-foreground font-mono text-xs">{row.sku}</span>
                    <span className="text-muted-foreground text-xs">{row.stock} in stock</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
          </button>
          <button type="button" onClick={() => router.push(backHref)} className="border-input hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium">
            Cancel
          </button>
        </div>
      </form>

      {/* Outside the form above: a dialog's or quick action's own `<form>` nested inside this one
          would be invalid HTML and silently break which one a submit actually reaches
          (ARCHITECTURE.md D49). */}
      {actionsSlot && <div className="border-border border-t pt-4">{actionsSlot}</div>}
    </div>
  );
}
