"use client";

import { useRouter } from "next/navigation";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { ProductStatus } from "@/features/catalog/schemas";
import { archiveProductAction, restoreProductAction, setFeaturedAction } from "@/app/panel/(protected)/products/actions";

/** The list row's one-click featured toggle (filled star = featured). */
export function FeaturedStarButton({ id, isFeatured }: { id: number; isFeatured: boolean }) {
  const router = useRouter();
  const { formAction, pending } = useStaffAction(setFeaturedAction, () => router.refresh());

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isFeatured" value={isFeatured ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        aria-label={isFeatured ? "Remove from featured" : "Mark as featured"}
        aria-pressed={isFeatured}
        className="hover:bg-secondary rounded-md p-1 disabled:opacity-50"
      >
        <Icon d={ICON_PATHS.star} className={isFeatured ? "h-4 w-4 fill-current text-amber-500" : "text-muted-foreground h-4 w-4"} />
      </button>
    </form>
  );
}

/**
 * The one-click archive/restore (archiving covers draft and active alike; restore always returns
 * to active). `variant="icon"` is the list row's compact control; `"button"` is the edit page's
 * labelled one, next to Delete.
 */
export function ArchiveRestoreButton({ id, status, variant = "icon" }: { id: number; status: ProductStatus; variant?: "icon" | "button" }) {
  const router = useRouter();
  const isArchived = status === "archived";
  const action = isArchived ? restoreProductAction : archiveProductAction;
  const { formAction, pending } = useStaffAction(action, () => router.refresh());

  if (variant === "button") {
    return (
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" disabled={pending} className="border-input hover:bg-secondary rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">
          {pending ? "Saving…" : isArchived ? "Restore to active" : "Archive"}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        aria-label={isArchived ? "Restore to active" : "Archive"}
        className="hover:bg-secondary rounded-md p-1 disabled:opacity-50"
      >
        <Icon d={ICON_PATHS.archive} className="text-muted-foreground h-4 w-4" />
      </button>
    </form>
  );
}
