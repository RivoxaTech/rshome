"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Listbox, type ListboxItem } from "@/components/panel/Listbox";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { PLACEMENT_CREATE, type PlacementCreate } from "@/features/catalog/schemas";
import type { StaffActionResult } from "@/features/catalog/staff-service";

const PLACEMENT_ITEMS: ListboxItem[] = PLACEMENT_CREATE.map((option) => ({
  value: option,
  label: option === "top" ? "Top" : option === "end" ? "End" : "Position",
}));

/**
 * A per-row "Move to top/end/position N" quick action (the arrange page's and the variants card's),
 * posting `placement`/`position` plus the caller's `hiddenFields` (the row's id, and any scope) to
 * `action` — the usual tiny-form quick-action shape, refreshing the page on success.
 */
export function MoveToControl({
  action,
  hiddenFields,
  total,
  itemName,
}: {
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  hiddenFields: Record<string, string | number>;
  /** How many rows share this order: the upper bound of the position input. */
  total: number;
  /** For the controls' accessible names, e.g. "Move Red / Large to". */
  itemName: string;
}) {
  const router = useRouter();
  const { state, formAction, pending } = useStaffAction(action, () => router.refresh());
  const [placement, setPlacement] = useState<PlacementCreate>("end");

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Listbox
        name="placement"
        value={placement}
        items={PLACEMENT_ITEMS}
        ariaLabel={`Move ${itemName} to`}
        className="w-24 shrink-0 text-xs [&_summary]:px-1.5 [&_summary]:py-1"
        onChange={(value) => setPlacement(value as PlacementCreate)}
      />
      {placement === "position" && (
        <input
          type="number"
          name="position"
          min={1}
          max={total}
          defaultValue={1}
          aria-label={`Position for ${itemName}`}
          className="border-input bg-background w-14 rounded-md border px-1.5 py-1 text-xs"
        />
      )}
      <button type="submit" disabled={pending} className="border-input hover:bg-secondary rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50">
        {pending ? "…" : "Move"}
      </button>
      {state && !state.ok && <span role="alert" className="text-destructive basis-full text-xs">{state.error}</span>}
    </form>
  );
}
