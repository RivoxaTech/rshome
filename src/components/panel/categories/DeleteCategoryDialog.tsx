"use client";

import { useActionState, useState } from "react";
import { Dialog } from "@/components/panel/Dialog";
import type { DeleteGuard, StaffActionResult } from "@/features/catalog/staff-service";
import { deleteCategoryAction, hideCategoryAction } from "@/app/panel/(protected)/categories/actions";

const initialState: StaffActionResult | null = null;

/**
 * The edit page's Delete button: refused with the reason (and, when it's the products count that
 * blocks it, a one-click "Hide instead") when `guard` isn't `allowed`, otherwise a plain confirm.
 */
export function DeleteCategoryDialog({ id, guard }: { id: number; guard: DeleteGuard }) {
  const [open, setOpen] = useState(false);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteCategoryAction, initialState);
  const [hideState, hideFormAction, hidePending] = useActionState(hideCategoryAction, initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-destructive hover:bg-destructive/10 rounded-md px-3 py-2 text-sm font-medium"
      >
        Delete
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Delete category">
        {guard.allowed ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">This can&apos;t be undone. Its image files will be removed too.</p>
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
        ) : guard.reason === "has_children" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              This category has {guard.count} sub-{guard.count === 1 ? "category" : "categories"}. Move or delete them first.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {guard.count} {guard.count === 1 ? "product uses" : "products use"} this category, so it can&apos;t be deleted. Hide it instead to keep it
              out of the storefront.
            </p>
            {hideState && !hideState.ok && <p className="text-destructive text-sm">{hideState.error}</p>}
            <form action={hideFormAction} className="flex justify-end gap-2">
              <input type="hidden" name="id" value={id} />
              <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Close
              </button>
              <button
                type="submit"
                disabled={hidePending}
                className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {hidePending ? "Hiding…" : "Hide instead"}
              </button>
            </form>
          </div>
        )}
      </Dialog>
    </>
  );
}
