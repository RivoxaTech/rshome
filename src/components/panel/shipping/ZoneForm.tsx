"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { CountryOption } from "@/config/countries";
import { Field, FormNotice, inputClass } from "@/components/panel/FormField";
import { Listbox } from "@/components/panel/Listbox";
import { Switch } from "@/components/panel/Switch";
import { ZoneAreasField } from "@/components/panel/shipping/ZoneAreasField";
import { ZONE_MODES, ZONE_MODE_LABELS, type ZoneMode } from "@/features/shipping/schemas";
import type { StaffActionResult, ZoneAreaView } from "@/features/shipping/staff-service";

type ZoneFormValues = {
  id: number | null;
  name: string;
  mode: ZoneMode;
  flatRate: string;
  freeOverAmount: string;
  codEnabled: boolean;
  isActive: boolean;
  isFallback: boolean;
  areas: ZoneAreaView[];
};

const MODE_ITEMS = ZONE_MODES.map((mode) => ({ value: mode, label: ZONE_MODE_LABELS[mode] }));

/**
 * Create/edit a shipping zone (S14): one `<form>`; the edit page's quick action and delete dialog
 * come in through `actionsSlot`, rendered *outside* this form (D49). `version` is the row's
 * concurrency token. The rest-of-world flag is offered on create only while no fallback exists
 * (`offerFallback`), and a fallback zone's Active switch is pinned on.
 */
export function ZoneForm({
  mode,
  initial,
  version,
  countries,
  offerFallback,
  action,
  backHref,
  actionsSlot,
}: {
  mode: "create" | "edit";
  initial: ZoneFormValues;
  version: string;
  countries: CountryOption[];
  offerFallback: boolean;
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  backHref: string;
  actionsSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const [zoneMode, setZoneMode] = useState<ZoneMode>(initial.mode);
  const [codEnabled, setCodEnabled] = useState(initial.codEnabled);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [isFallback, setIsFallback] = useState(initial.isFallback);
  const [areas, setAreas] = useState<ZoneAreaView[]>(initial.areas);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;
  const coversOutsidePakistan = isFallback || areas.some((area) => area.countryCode !== "PK");

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {mode === "edit" && <input type="hidden" name="id" value={initial.id ?? ""} />}
        <input type="hidden" name="version" value={version} />

        <Field id="name" label="Zone name" error={fieldErrors?.name} hint="Staff-facing; customers never see it.">
          <input id="name" name="name" defaultValue={initial.name} required maxLength={150} className={`${inputClass} w-full`} />
        </Field>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="mode" label="Mode" error={fieldErrors?.mode} hint="Weight-based rates aren't available yet; products already carry weights for a later release.">
              <Listbox id="mode" name="mode" value={zoneMode} onChange={(next) => setZoneMode(next as ZoneMode)} ariaLabel="Mode" items={MODE_ITEMS} />
            </Field>
          </div>
          <div className="flex-1">
            {zoneMode === "flat" ? (
              <Field id="flatRate" label="Flat delivery charge (PKR)" error={fieldErrors?.flatRate} hint="Added to every order in this zone at checkout. Must be above 0.">
                <input id="flatRate" name="flatRate" defaultValue={initial.flatRate === "0.00" ? "" : initial.flatRate} inputMode="decimal" required className={`${inputClass} w-full`} />
              </Field>
            ) : (
              <Field id="flatRate" label="Flat delivery charge" hint="Quote mode: the charge stays 0 and staff set it per order on WhatsApp.">
                <input id="flatRate" value="0.00" readOnly disabled className={`${inputClass} w-full opacity-60`} />
                <input type="hidden" name="flatRate" value="" />
              </Field>
            )}
          </div>
        </div>

        {zoneMode === "flat" ? (
          <Field id="freeOverAmount" label="Free delivery over (PKR)" error={fieldErrors?.freeOverAmount} hint="Optional. Compared with the goods total after discounts and coupon.">
            <input id="freeOverAmount" name="freeOverAmount" defaultValue={initial.freeOverAmount} inputMode="decimal" className={`${inputClass} w-full sm:max-w-xs`} />
          </Field>
        ) : (
          <input type="hidden" name="freeOverAmount" value="" />
        )}

        <div className="border-border flex flex-col gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-medium">Cash on delivery</span>
              <p className="text-muted-foreground text-xs">Offer COD to addresses in this zone.</p>
            </div>
            <Switch name="codEnabled" checked={codEnabled} onChange={setCodEnabled} />
          </div>
          {coversOutsidePakistan && (
            <p className="border-amber-500/40 bg-amber-500/10 rounded-md border p-2.5 text-xs" role="note">
              COD is Pakistan-only. Whatever this switch says, the checkout refuses cash on delivery for an address outside Pakistan — here it can only ever apply to this zone&apos;s Pakistani addresses, if it has
              any.
            </p>
          )}
          {fieldErrors?.codEnabled && <p className="text-destructive text-xs">{fieldErrors.codEnabled}</p>}
        </div>

        <div className="border-border flex flex-col gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-medium">Active</span>
              <p className="text-muted-foreground text-xs">
                {isFallback ? "The rest-of-world zone always stays active." : "Inactive: its areas resolve to another zone or the rest-of-world zone. Past orders never change."}
              </p>
            </div>
            {isFallback ? <input type="hidden" name="isActive" value="true" /> : <Switch name="isActive" checked={isActive} onChange={setIsActive} />}
          </div>
          {fieldErrors?.isActive && <p className="text-destructive text-xs">{fieldErrors.isActive}</p>}
          {mode === "create" && offerFallback && (
            <div className="border-border flex items-center justify-between gap-3 border-t pt-3">
              <div>
                <span className="text-sm font-medium">Rest of world (fallback)</span>
                <p className="text-muted-foreground text-xs">Covers every address no other zone does. Exactly one zone must be this.</p>
              </div>
              <Switch name="isFallback" checked={isFallback} onChange={setIsFallback} />
            </div>
          )}
          {fieldErrors?.isFallback && <p className="text-destructive text-xs">{fieldErrors.isFallback}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Areas</span>
          <p className="text-muted-foreground mb-2 text-xs">
            {isFallback ? "A rest-of-world zone needs no areas — it catches whatever the others don't. Any you add match first, like any other zone's." : "Countries, or cities within a country. A city-level area beats a whole-country one, and both beat the rest-of-world zone."}
          </p>
          <ZoneAreasField countries={countries} value={areas} onChange={setAreas} error={fieldErrors?.areas} />
        </div>

        <p className="bg-muted text-muted-foreground rounded-md p-3 text-xs">
          Changing a zone never changes an order already placed (orders keep their own delivery charge), and a checkout in progress is re-priced when the customer presses Place order.
        </p>

        {formError && (
          <FormNotice tone="error">
            {formError}{" "}
            <button type="button" onClick={() => window.location.reload()} className="font-medium underline underline-offset-2">
              Reload
            </button>
          </FormNotice>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={pending} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {pending ? "Saving…" : mode === "create" ? "Create zone" : "Save changes"}
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
