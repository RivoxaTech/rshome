"use client";

import { useRouter } from "next/navigation";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { setDiscountActiveAction } from "@/app/panel/(protected)/discounts/actions";

/**
 * The one-click Activate/Deactivate (the row's compact `icon` control, or the edit page's labelled
 * `button`). Its own `<form>`, rendered outside any save form (D49).
 */
export function DiscountActiveToggle({ id, isActive, variant = "icon" }: { id: number; isActive: boolean; variant?: "icon" | "button" }) {
  const router = useRouter();
  const { state, formAction, pending } = useStaffAction(setDiscountActiveAction, () => router.refresh());
  const label = isActive ? "Deactivate" : "Activate";

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      {variant === "button" ? (
        <button type="submit" disabled={pending} className="border-input hover:bg-secondary rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">
          {pending ? "Saving…" : label}
        </button>
      ) : (
        <button type="submit" disabled={pending} aria-label={label} title={label} className="hover:bg-secondary rounded-md p-1 disabled:opacity-50">
          <Icon d={ICON_PATHS.power} className={`h-4 w-4 ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
        </button>
      )}
      {state && !state.ok && <span role="alert" className="text-destructive text-xs">{state.error}</span>}
    </form>
  );
}
