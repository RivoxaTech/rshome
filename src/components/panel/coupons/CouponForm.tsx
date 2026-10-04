"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Listbox } from "@/components/panel/Listbox";
import { Switch } from "@/components/panel/Switch";
import { COUPON_TYPES, type CouponType } from "@/features/coupons/schemas";
import type { StaffActionResult } from "@/features/coupons/staff-service";
import { dateInputMin } from "@/features/discounts/dates";
import { inputClass } from "@/components/panel/FormField";

type CouponFormValues = {
  id: number | null;
  code: string;
  type: CouponType;
  value: string;
  minOrder: string;
  maxDiscount: string;
  usageLimit: string;
  perCustomerLimit: string;
  /** Karachi `datetime-local` values ("YYYY-MM-DDTHH:mm"), or "" for an open bound. */
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const TYPE_LABELS: Record<CouponType, string> = { percent: "Percentage off the order", fixed: "Fixed amount off the order (PKR)" };

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
 * Create/edit a coupon (S13): one `<form>`; the edit page's quick action, delete dialog and usage
 * card come in through `actionsSlot`/the page, rendered *outside* this form (D49). `usageCount`
 * (edit only) drives the "already used" warning when the type or value is being changed.
 */
export function CouponForm({
  mode,
  initial,
  usageCount,
  action,
  backHref,
  minDateTime,
  actionsSlot,
}: {
  mode: "create" | "edit";
  initial: CouponFormValues;
  usageCount: number;
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  backHref: string;
  /** The current Karachi time as a `datetime-local` value, from the server page (so SSR and the client agree) — the date fields' `min`. */
  minDateTime: string;
  actionsSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const [type, setType] = useState<CouponType>(initial.type);
  const [value, setValue] = useState(initial.value);
  const [isActive, setIsActive] = useState(initial.isActive);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;
  const termsChanged = mode === "edit" && usageCount > 0 && (type !== initial.type || value.trim() !== initial.value);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {mode === "edit" && <input type="hidden" name="id" value={initial.id ?? ""} />}

        <Field id="code" label="Code" error={fieldErrors?.code} hint="3–32 characters: letters, numbers, dashes and underscores. Saved in capitals; customers can type it in any case.">
          <input id="code" name="code" defaultValue={initial.code} required minLength={3} maxLength={32} autoCapitalize="characters" autoComplete="off" className={`${inputClass} font-mono uppercase`} />
        </Field>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="type" label="Type" error={fieldErrors?.type}>
              <Listbox id="type" name="type" value={type} onChange={(next) => setType(next as CouponType)} ariaLabel="Type" items={COUPON_TYPES.map((item) => ({ value: item, label: TYPE_LABELS[item] }))} />
            </Field>
          </div>
          <div className="flex-1">
            <Field id="value" label={type === "percent" ? "Percent off (1–100)" : "Amount off (PKR)"} error={fieldErrors?.value} hint={type === "percent" ? "Of the order's subtotal, rounded to whole rupees." : "Never more than the order's subtotal."}>
              <input id="value" name="value" value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" required className={inputClass} />
            </Field>
          </div>
        </div>

        {termsChanged && (
          <div className="border-amber-500/40 bg-amber-500/10 rounded-md border p-3 text-sm" role="status">
            This coupon has already been used {usageCount} {usageCount === 1 ? "time" : "times"}. Changing its type or value only affects future orders — the orders
            already placed keep the discount they were given.
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="minOrder" label="Minimum order (PKR)" error={fieldErrors?.minOrder} hint="Optional. Compared with the subtotal before the coupon.">
              <input id="minOrder" name="minOrder" defaultValue={initial.minOrder} inputMode="decimal" className={inputClass} />
            </Field>
          </div>
          <div className="flex-1">
            {type === "percent" ? (
              <Field id="maxDiscount" label="Maximum discount (PKR)" error={fieldErrors?.maxDiscount} hint="Optional cap for a percentage coupon.">
                <input id="maxDiscount" name="maxDiscount" defaultValue={initial.maxDiscount} inputMode="decimal" className={inputClass} />
              </Field>
            ) : (
              // Posted empty for a fixed coupon so a cap left over from switching the type can't be saved.
              <input type="hidden" name="maxDiscount" value="" />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="usageLimit" label="Total usage limit" error={fieldErrors?.usageLimit} hint="Optional. How many orders in total may use it.">
              <input id="usageLimit" name="usageLimit" type="number" min={1} step={1} defaultValue={initial.usageLimit} className={inputClass} />
            </Field>
          </div>
          <div className="flex-1">
            <Field id="perCustomerLimit" label="Per-customer limit" error={fieldErrors?.perCustomerLimit} hint="Optional. Counted by the customer's phone number, as entered at checkout.">
              <input id="perCustomerLimit" name="perCustomerLimit" type="number" min={1} step={1} defaultValue={initial.perCustomerLimit} className={inputClass} />
            </Field>
          </div>
        </div>

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
            <p className="text-muted-foreground text-xs">Off keeps it saved but never accepted, whatever the dates say.</p>
          </div>
          <Switch name="isActive" checked={isActive} onChange={setIsActive} />
        </div>

        <p className="bg-muted text-muted-foreground rounded-md p-3 text-xs">
          Coupons and discounts never combine: a coupon is refused while the cart holds any discounted item, and an applied coupon is removed (with a notice) the
          moment a discounted item is added.
        </p>

        {formError && <p role="alert" className="text-destructive text-sm">{formError}</p>}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={pending} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {pending ? "Saving…" : mode === "create" ? "Create coupon" : "Save changes"}
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
