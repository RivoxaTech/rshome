"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { StaffActionResult, UserDeleteGuard } from "@/features/users/staff-service";
import { deleteUserAction, setUserActiveAction } from "@/app/panel/(protected)/users/actions";

/**
 * The edit page's Delete button (S20): refused with the reason and a "Deactivate instead"
 * shortcut once the user has any history (the ordered-variant pattern), a plain confirm for a
 * user who never signed in. The server refuses regardless of what's shown.
 */
export function DeleteUserDialog({ id, name, isActive, guard }: { id: number; name: string; isActive: boolean; guard: UserDeleteGuard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteUserAction, null as StaffActionResult | null);
  const deactivate = useStaffAction(setUserActiveAction, () => {
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-destructive hover:bg-destructive/10 rounded-md px-3 py-2 text-sm font-medium">
        Delete
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${name}`}>
        {guard.allowed ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">This user has never signed in and has no history, so the record can be removed. This can&apos;t be undone.</p>
            {deleteState && !deleteState.ok && <p className="text-destructive text-sm">{deleteState.error}</p>}
            <form action={deleteFormAction} className="flex justify-end gap-2">
              <input type="hidden" name="id" value={id} />
              <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={deletePending} className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{guard.reason}</p>
            {deactivate.state && !deactivate.state.ok && <p className="text-destructive text-sm">{deactivate.state.error}</p>}
            <form action={deactivate.formAction} className="flex justify-end gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="isActive" value="false" />
              <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Close
              </button>
              {isActive && (
                <button type="submit" disabled={deactivate.pending} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                  {deactivate.pending ? "Saving…" : "Deactivate instead"}
                </button>
              )}
            </form>
          </div>
        )}
      </Dialog>
    </>
  );
}
