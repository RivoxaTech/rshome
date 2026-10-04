"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Listbox, type ListboxItem } from "@/components/panel/Listbox";
import { Switch } from "@/components/panel/Switch";
import { ProductMultiSelect } from "@/components/panel/discounts/ProductMultiSelect";
import { dateInputMin } from "@/features/discounts/dates";
import type { StaffActionResult, DiscountOverlapResult } from "@/features/discounts/staff-service";
import { DISCOUNT_TARGET_TYPES, DISCOUNT_TYPES, MAX_DISCOUNT_PRODUCTS, type DiscountTargetType, type DiscountType } from "@/features/discounts/schemas";
import type { CategoryOption, ProductOption } from "@/features/discounts/staff-repo";
import { discountOverlapAction } from "@/app/panel/(protected)/discounts/actions";

type DiscountFormValues = {
  id: number | null;
  name: string;
  type: DiscountType;
  value: string;
  targetType: DiscountTargetType;
  categoryId: number | null;
  productIds: number[];
  /** Karachi `datetime-local` values ("YYYY-MM-DDTHH:mm"), or "" for an open bound. */
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const TYPE_LABELS: Record<DiscountType, string> = { percent: "Percentage off", fixed: "Fixed amount off (PKR)" };
const TARGET_LABELS: Record<DiscountTargetType, string> = { all: "Whole store", category: "One category", product: "Chosen products" };

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
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

/**
 * Top-level categories first, each followed by its sub-categories ("Parent › Child"), the way the
 * pricing module resolves a category target: a parent's discount also matches products in its
 * sub-categories (`discountMatchesProduct`). Hidden categories stay choosable, marked as such.
 */
function categoryItems(categories: CategoryOption[]): ListboxItem[] {
  const items: ListboxItem[] = [];
  for (const parent of categories.filter((category) => category.parentId === null)) {
    items.push({ value: String(parent.id), label: `${parent.name}${parent.isActive ? "" : " (hidden)"}` });
    for (const child of categories.filter((category) => category.parentId === parent.id)) {
      items.push({ value: String(child.id), label: `${parent.name} › ${child.name}${child.isActive ? "" : " (hidden)"}` });
    }
  }
  return items;
}

/**
 * Create/edit a discount (S12): one `<form>`; the edit page's Activate/Deactivate and Delete
 * controls come in through `actionsSlot`, rendered *outside* this form (D49). The overlap hint
 * asks the server (the pricing module's own matching) as the targets change.
 */
export function DiscountForm({
  mode,
  initial,
  categories,
  products,
  action,
  backHref,
  minDateTime,
  actionsSlot,
}: {
  mode: "create" | "edit";
  initial: DiscountFormValues;
  categories: CategoryOption[];
  products: ProductOption[];
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  backHref: string;
  /** The current Karachi time as a `datetime-local` value, from the server page (so SSR and the client agree) — the date fields' `min`. */
  minDateTime: string;
  actionsSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const [type, setType] = useState<DiscountType>(initial.type);
  const [targetType, setTargetType] = useState<DiscountTargetType>(initial.targetType);
  const [categoryId, setCategoryId] = useState(initial.categoryId !== null ? String(initial.categoryId) : "");
  const [productIds, setProductIds] = useState<number[]>(initial.productIds);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [overlap, setOverlap] = useState<DiscountOverlapResult | null>(null);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;

  // Debounced, and only the latest request may set the hint: a "Whole store" probe matches every
  // product and can resolve *after* a narrower one fired later, which would overwrite the correct
  // answer with a stale, over-inclusive list (seen live in the first browser pass).
  const productKey = productIds.join(",");
  const requestSeq = useRef(0);
  useEffect(() => {
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      discountOverlapAction({ targetType, categoryId, productIds: productKey, excludeId: initial.id ?? "" })
        .then((result) => {
          if (seq === requestSeq.current) setOverlap(result);
        })
        .catch(() => {
          if (seq === requestSeq.current) setOverlap(null);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [targetType, categoryId, productKey, initial.id]);

  const overlaps = overlap && overlap.ok ? overlap.overlaps : [];

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {mode === "edit" && <input type="hidden" name="id" value={initial.id ?? ""} />}

        <Field id="name" label="Name" error={fieldErrors?.name} hint="Internal only — customers see the price and badge, not this name.">
          <input id="name" name="name" defaultValue={initial.name} required maxLength={150} className={inputClass} />
        </Field>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="type" label="Type" error={fieldErrors?.type}>
              <Listbox id="type" name="type" value={type} onChange={(value) => setType(value as DiscountType)} ariaLabel="Type" items={DISCOUNT_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))} />
            </Field>
          </div>
          <div className="flex-1">
            <Field
              id="value"
              label={type === "percent" ? "Percent off (1–100)" : "Amount off per unit (PKR)"}
              error={fieldErrors?.value}
              hint={type === "percent" ? "Rounded to whole rupees on each price." : "Taken off every unit's own price, never below PKR 0."}
            >
              <input id="value" name="value" defaultValue={initial.value} inputMode="decimal" required className={inputClass} />
            </Field>
          </div>
        </div>

        <Field id="targetType" label="Applies to" error={fieldErrors?.targetType}>
          <Listbox
            id="targetType"
            name="targetType"
            value={targetType}
            onChange={(value) => setTargetType(value as DiscountTargetType)}
            ariaLabel="Applies to"
            items={DISCOUNT_TARGET_TYPES.map((value) => ({ value, label: TARGET_LABELS[value] }))}
          />
        </Field>

        {targetType === "category" && (
          <Field id="categoryId" label="Category" error={fieldErrors?.categoryId} hint="A parent category's discount also covers its sub-categories.">
            <Listbox id="categoryId" name="categoryId" value={categoryId} onChange={setCategoryId} placeholder="Choose a category" ariaLabel="Category" items={categoryItems(categories)} />
          </Field>
        )}

        {targetType === "product" && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Products</span>
            <ProductMultiSelect name="productIds" options={products} value={productIds} onChange={setProductIds} max={MAX_DISCOUNT_PRODUCTS} error={fieldErrors?.productIds} />
          </div>
        )}

        {overlaps.length > 0 && (
          <div className="border-amber-500/40 bg-amber-500/10 rounded-md border p-3 text-sm" role="status">
            <p>
              These products also match: <span className="font-medium">{overlaps.map((other) => other.name).join(", ")}</span>. The lowest final price wins; discounts never
              stack.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="startsAt" label="Starts" error={fieldErrors?.startsAt} hint="Optional. Karachi time; can't be in the past.">
              <input id="startsAt" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} min={dateInputMin(initial.startsAt, minDateTime)} className={inputClass} />
            </Field>
          </div>
          <div className="flex-1">
            <Field id="endsAt" label="Ends" error={fieldErrors?.endsAt} hint="Optional. Must be after the start and in the future.">
              <input id="endsAt" name="endsAt" type="datetime-local" defaultValue={initial.endsAt} min={dateInputMin(initial.endsAt, minDateTime)} className={inputClass} />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-sm font-medium">Active</span>
            <p className="text-muted-foreground text-xs">Off keeps it saved but never applied, whatever the dates say.</p>
          </div>
          <Switch name="isActive" checked={isActive} onChange={setIsActive} />
        </div>

        {formError && <p role="alert" className="text-destructive text-sm">{formError}</p>}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {pending ? "Saving…" : mode === "create" ? "Create discount" : "Save changes"}
          </button>
          <button type="button" onClick={() => router.push(backHref)} className="border-input hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium">
            Cancel
          </button>
        </div>
      </form>

      {/* Outside the form above: the quick action's and the dialog's own `<form>`s must never nest inside it (D49). */}
      {actionsSlot && <div className="border-border border-t pt-4">{actionsSlot}</div>}
    </div>
  );
}
