"use client";

import { useActionState, useState } from "react";
import type { CountryOption } from "@/config/countries";
import { DetailCard } from "@/components/panel/DetailCard";
import { Field, inputClass } from "@/components/panel/FormField";
import { CountrySearch } from "@/components/panel/shipping/CountrySearch";
import type { TestDestinationResult } from "@/features/shipping/staff-service";
import { testDestinationAction } from "@/app/panel/(protected)/shipping/actions";

const PAKISTAN = "PK";

/**
 * "Test a destination" (S14): pick a country (and a city — Karachi or another — for Pakistan),
 * optionally a goods total, and see which zone the real resolver picks and what the checkout
 * would show. Its own `<form>`, beside the zones list. Read-only: no new logic, the Server Action
 * calls the same resolution and pricing functions the checkout does.
 */
export function TestDestinationBox({ countries, defaultCountry }: { countries: CountryOption[]; defaultCountry: string }) {
  const [state, formAction, pending] = useActionState(testDestinationAction, null as TestDestinationResult | null);
  const [country, setCountry] = useState<CountryOption>(() => countries.find((option) => option.code === defaultCountry) ?? countries[0]);
  const [cityChoice, setCityChoice] = useState<"karachi" | "other">("karachi");
  const isPakistan = country.code === PAKISTAN;

  return (
    <DetailCard title="Test a destination">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="country" value={country.code} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="test-country" label="Country" hint={`Chosen: ${country.name} (${country.code})`}>
            <CountrySearch id="test-country" countries={countries} onPick={setCountry} placeholder="Type to change the country…" ariaLabel="Destination country" />
          </Field>
          {isPakistan ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">City</span>
              <div className="flex gap-2">
                {(["karachi", "other"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={cityChoice === choice}
                    onClick={() => setCityChoice(choice)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${cityChoice === choice ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-secondary"}`}
                  >
                    {choice === "karachi" ? "Karachi" : "Other city"}
                  </button>
                ))}
              </div>
              {/* Keyed so React remounts rather than turning the controlled hidden input into the free-text one. */}
              {cityChoice === "karachi" ? (
                <input key="karachi" type="hidden" name="city" value="Karachi" />
              ) : (
                <input key="other" name="city" placeholder="e.g. Lahore" aria-label="City" maxLength={100} className={`${inputClass} w-full`} />
              )}
              <p className="text-muted-foreground text-xs">The checkout&apos;s own picker: Karachi, or any other city typed in.</p>
            </div>
          ) : (
            <Field id="test-city" label="City (optional)" hint="Only matters if a zone has a city-level area in this country.">
              <input id="test-city" name="city" maxLength={100} className={`${inputClass} w-full`} />
            </Field>
          )}
        </div>
        <Field id="test-goods" label="Goods total (PKR, optional)" hint="For a flat-rate zone's free-over threshold.">
          <input id="test-goods" name="goodsTotal" inputMode="decimal" placeholder="e.g. 5000" className={`${inputClass} w-full sm:max-w-xs`} />
        </Field>
        <div>
          <button type="submit" disabled={pending} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
            {pending ? "Checking…" : "Resolve zone"}
          </button>
        </div>
      </form>

      {state &&
        (state.ok ? (
          <dl className="bg-muted/60 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md p-3 text-sm" aria-live="polite">
            <dt className="text-muted-foreground">Destination</dt>
            <dd>{state.destination}</dd>
            <dt className="text-muted-foreground">Zone</dt>
            <dd className="font-medium">{state.outcome.zone ? state.outcome.zone.name : "None"}</dd>
            <dt className="text-muted-foreground">Delivery</dt>
            <dd>{state.deliveryText}</dd>
            <dt className="text-muted-foreground">COD</dt>
            <dd>{state.codText}</dd>
          </dl>
        ) : (
          <p className="text-destructive text-sm" role="alert">
            {state.error}
          </p>
        ))}
    </DetailCard>
  );
}
