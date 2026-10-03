"use client";

import { useState } from "react";
import type { CountryOption } from "@/config/countries";
import { Field, inputClass } from "@/components/panel/FormField";
import { CountrySearch } from "@/components/panel/shipping/CountrySearch";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { MAX_ZONE_AREAS, normalizeCity } from "@/features/shipping/schemas";
import type { ZoneAreaView } from "@/features/shipping/staff-service";

/** "karachi" -> "Karachi" for a chip; the server stores cities lowercase. */
function titleCase(city: string): string {
  return city.replace(/(^|[\s-])\p{L}/gu, (match) => match.toUpperCase());
}

/**
 * The zone's areas as chips (S14): a whole country ("United Kingdom") or one city ("Karachi,
 * Pakistan"). Add a country from the search, or a city by picking the country and typing the city.
 * Posts ONE hidden `areas` field of comma-separated `CC` / `CC:city` tokens — the literal wire
 * format `zoneAreasField` reads. Overlap with another zone is the server's call, under the lock.
 */
export function ZoneAreasField({ countries, value, onChange, error }: { countries: CountryOption[]; value: ZoneAreaView[]; onChange: (areas: ZoneAreaView[]) => void; error?: string }) {
  const [cityCountry, setCityCountry] = useState<CountryOption | null>(null);
  const [city, setCity] = useState("");
  const byCode = new Map(countries.map((country) => [country.code, country.name]));
  const wholeCountries = new Set(value.filter((area) => area.city === null).map((area) => area.countryCode));
  const full = value.length >= MAX_ZONE_AREAS;

  function add(area: { countryCode: string; city: string | null }) {
    const token = area.city ? `${area.countryCode}:${area.city}` : area.countryCode;
    if (value.some((existing) => existing.token === token)) return;
    const country = byCode.get(area.countryCode) ?? area.countryCode;
    onChange([...value, { ...area, token, label: area.city ? `${titleCase(area.city)}, ${country}` : country }]);
  }

  function addCity() {
    const normalized = normalizeCity(city);
    if (!cityCountry || normalized.length < 2) return;
    add({ countryCode: cityCountry.code, city: normalized });
    setCity("");
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="areas" value={value.map((area) => area.token).join(",")} />

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Areas in this zone">
          {value.map((area) => (
            <li key={area.token} className="bg-secondary text-foreground inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs">
              <span className="truncate">{area.label}</span>
              <button type="button" aria-label={`Remove ${area.label}`} onClick={() => onChange(value.filter((other) => other.token !== area.token))} className="hover:bg-background/70 rounded-full p-0.5">
                <Icon d={ICON_PATHS.close} className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">No areas yet. A zone with no areas is only reached as the rest-of-world fallback.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="area-country" label="Add a whole country" hint="Every address in that country, unless a city-level area matches first.">
          <CountrySearch id="area-country" countries={countries} exclude={wholeCountries} onPick={(country) => add({ countryCode: country.code, city: null })} placeholder={full ? "Zone is full" : "Type a country name…"} ariaLabel="Add a country to this zone" />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Add a city or region</span>
          {cityCountry ? (
            <div className="flex gap-2">
              <input
                id="area-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCity();
                  }
                }}
                placeholder={`City in ${cityCountry.name}`}
                aria-label={`City in ${cityCountry.name}`}
                maxLength={100}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button type="button" onClick={addCity} disabled={full || normalizeCity(city).length < 2} className="border-input hover:bg-secondary rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">
                Add
              </button>
              <button type="button" onClick={() => setCityCountry(null)} aria-label="Choose another country" className="text-muted-foreground hover:bg-secondary rounded-md px-2 text-xs">
                Change
              </button>
            </div>
          ) : (
            <CountrySearch id="area-city-country" countries={countries} onPick={setCityCountry} placeholder="First pick the country…" ariaLabel="Country of the city to add" />
          )}
          <p className="text-muted-foreground text-xs">Matched against the city the customer types at checkout (case doesn&apos;t matter). Pakistan&apos;s picker offers &ldquo;Karachi&rdquo;.</p>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {value.length} of {MAX_ZONE_AREAS}. An area can belong to only one zone.
      </p>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
