"use client";

import { useActionState, useState } from "react";
import { Dialog } from "@/components/panel/Dialog";
import type { RoleDeleteGuard, StaffActionResult } from "@/features/roles/staff-service";
import { deleteRoleAction } from "@/app/panel/(protected)/roles/actions";

/** The edit page's Delete button (S20): refused with the member count while any user holds the role; a plain confirm otherwise. The server refuses regardless. */
export function DeleteRoleDialog({ id, name, guard }: { id: number; name: string; guard: RoleDeleteGuard }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteRoleAction, null as StaffActionResult | null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-destructive hover:bg-destructive/10 rounded-md px-3 py-2 text-sm font-medium">
        Delete
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${name}`}>
        {guard.allowed ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">No user holds this role, so it can be removed. This can&apos;t be undone.</p>
            {state && !state.ok && <p className="text-destructive text-sm">{state.error}</p>}
            <form action={formAction} className="flex justify-end gap-2">
              <input type="hidden" name="id" value={id} />
              <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={pending} className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                {pending ? "Deleting…" : "Delete"}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{guard.reason}</p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
