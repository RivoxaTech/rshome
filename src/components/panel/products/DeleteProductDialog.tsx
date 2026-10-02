"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { ProductDeleteGuard } from "@/features/catalog/products-staff-service";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { archiveProductAction, deleteProductAction } from "@/app/panel/(protected)/products/actions";

const initialState: StaffActionResult | null = null;

/**
 * The edit page's Delete button: refused with the order count (and an "Archive instead" shortcut)
 * when `guard` isn't `allowed`, otherwise a plain confirm. Mirrors `DeleteCategoryDialog`.
 */
export function DeleteProductDialog({ id, guard }: { id: number; guard: ProductDeleteGuard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteProductAction, initialState);
  const {
    state: archiveState,
    formAction: archiveFormAction,
    pending: archivePending,
  } = useStaffAction(archiveProductAction, () => {
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-destructive hover:bg-destructive/10 rounded-md px-3 py-2 text-sm font-medium"
      >
        Delete
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Delete product">
        {guard.allowed ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">This can&apos;t be undone. Its image file will be removed too.</p>
            {deleteState && !deleteState.ok && <p className="text-destructive text-sm">{deleteState.error}</p>}
            <form action={deleteFormAction} className="flex justify-end gap-2">
              <input type="hidden" name="id" value={id} />
              <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={deletePending}
                className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {guard.count} {guard.count === 1 ? "order uses" : "orders use"} this product, so it can&apos;t be deleted. Archive it instead to keep it out
              of the storefront.
            </p>
            {archiveState && !archiveState.ok && <p className="text-destructive text-sm">{archiveState.error}</p>}
            <form action={archiveFormAction} className="flex justify-end gap-2">
              <input type="hidden" name="id" value={id} />
              <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Close
              </button>
              <button
                type="submit"
                disabled={archivePending}
                className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {archivePending ? "Archiving…" : "Archive instead"}
              </button>
            </form>
          </div>
        )}
      </Dialog>
    </>
  );
}
