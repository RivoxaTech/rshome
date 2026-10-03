"use client";

import { useMemo, useState } from "react";
import type { CountryOption } from "@/config/countries";
import { inputClass } from "@/components/panel/FormField";

const MAX_RESULTS = 8;

/**
 * A searchable country picker (S14): type part of a name or an ISO code, pick from the matches.
 * Used by the areas editor (to add an area) and the destination tester (to choose the country).
 * 250 countries are too many for `Listbox`, so this filters instead; it reports a choice through
 * `onPick` and the caller decides what to do with it.
 */
export function CountrySearch({
  countries,
  onPick,
  placeholder,
  ariaLabel,
  exclude,
  id,
}: {
  countries: CountryOption[];
  onPick: (country: CountryOption) => void;
  placeholder: string;
  ariaLabel: string;
  /** Codes to leave out of the matches (already chosen). */
  exclude?: ReadonlySet<string>;
  id?: string;
}) {
  const [search, setSearch] = useState("");

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return countries
      .filter((country) => !exclude?.has(country.code) && (country.name.toLowerCase().includes(needle) || country.code.toLowerCase() === needle))
      .slice(0, MAX_RESULTS);
  }, [search, countries, exclude]);

  return (
    <div className="relative flex flex-col gap-1">
      <input id={id} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off" className={`${inputClass} w-full`} />
      {search.trim() && (
        <ul role="listbox" aria-label="Matching countries" className="border-border bg-background shadow-soft absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border py-1 text-sm">
          {matches.length === 0 && <li className="text-muted-foreground px-3 py-1.5">No country matches.</li>}
          {matches.map((country) => (
            <li key={country.code}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick(country);
                  setSearch("");
                }}
                className="hover:bg-secondary flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
              >
                <span>{country.name}</span>
                <span className="text-muted-foreground font-mono text-xs">{country.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
