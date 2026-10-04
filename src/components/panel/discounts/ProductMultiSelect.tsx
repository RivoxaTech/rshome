"use client";

import { useMemo, useState } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { ProductOption } from "@/features/discounts/staff-repo";

const MAX_RESULTS = 8;

const STATUS_NOTE: Record<ProductOption["status"], string> = { active: "", draft: " · draft", archived: " · archived" };

/**
 * A searchable multi-select with chips (S12): type to filter the product list, click to add, × to
 * remove. The chosen ids post as ONE comma-separated hidden field (`name`), the literal wire
 * format `discountInputSchema` reads — repeated keys would collapse under `Object.fromEntries`.
 */
export function ProductMultiSelect({
  name,
  options,
  value,
  onChange,
  max,
  error,
}: {
  name: string;
  options: ProductOption[];
  value: number[];
  onChange: (ids: number[]) => void;
  max: number;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const chosen = new Set(value);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return options.filter((option) => !chosen.has(option.id) && option.name.toLowerCase().includes(needle)).slice(0, MAX_RESULTS);
    // `chosen` derives from `value`, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, options, value]);

  const full = value.length >= max;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value.join(",")} />

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen products">
          {value.map((id) => {
            const option = byId.get(id);
            return (
              <li key={id} className="bg-secondary text-foreground inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs">
                <span className="truncate">{option?.name ?? `#${id}`}</span>
                <button
                  type="button"
                  aria-label={`Remove ${option?.name ?? `#${id}`}`}
                  onClick={() => onChange(value.filter((other) => other !== id))}
                  className="hover:bg-background/70 rounded-full p-0.5"
                >
                  <Icon d={ICON_PATHS.close} className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-input bg-background focus-within:ring-ring flex items-center gap-2 rounded-md border px-3 py-2 focus-within:ring-2">
        <Icon d={ICON_PATHS.search} className="text-muted-foreground h-4 w-4 shrink-0" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={full ? `Up to ${max} products chosen` : "Type to find a product…"}
          aria-label="Find a product"
          disabled={full}
          className="w-full min-w-0 bg-transparent text-sm outline-none disabled:opacity-60"
        />
      </div>

      {search.trim() && !full && (
        <ul role="listbox" aria-label="Matching products" className="border-border bg-background max-h-56 overflow-y-auto rounded-md border py-1 text-sm">
          {matches.length === 0 && <li className="text-muted-foreground px-3 py-1.5">No product matches.</li>}
          {matches.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange([...value, option.id]);
                  setSearch("");
                }}
                className="hover:bg-secondary flex w-full items-center px-3 py-1.5 text-left"
              >
                {option.name}
                <span className="text-muted-foreground text-xs">{STATUS_NOTE[option.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-xs">
        {value.length} of {max} chosen. The discount applies to every variant of each chosen product.
      </p>
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
