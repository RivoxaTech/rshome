"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { StaffActionResult, ZoneDeleteGuard } from "@/features/shipping/staff-service";
import { deleteZoneAction, setZoneActiveAction } from "@/app/panel/(protected)/shipping/actions";

/**
 * The edit page's Delete button (S14): refused with the order count and a "Deactivate instead"
 * shortcut once any order used the zone (the ordered-variant/used-coupon pattern), refused flat
 * for the rest-of-world zone, a plain confirm otherwise. The server refuses regardless.
 */
export function DeleteZoneDialog({ id, name, isActive, guard }: { id: number; name: string; isActive: boolean; guard: ZoneDeleteGuard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteZoneAction, null as StaffActionResult | null);
  const deactivate = useStaffAction(setZoneActiveAction, () => {
    setOpen(false);
    router.refresh();
  });

  const cancelButton = (
    <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
      {guard.allowed ? "Cancel" : "Close"}
    </button>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-destructive hover:bg-destructive/10 rounded-md px-3 py-2 text-sm font-medium">
        Delete
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${name}`}>
        {guard.allowed ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">No order has used this zone, so it can be removed along with its areas. Addresses it covered fall back to the rest-of-world zone. This can&apos;t be undone.</p>
            {deleteState && !deleteState.ok && <p className="text-destructive text-sm">{deleteState.error}</p>}
            <form action={deleteFormAction} className="flex justify-end gap-2">
              <input type="hidden" name="id" value={id} />
              {cancelButton}
              <button type="submit" disabled={deletePending} className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </form>
          </div>
        ) : guard.reason === "fallback" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">This is the rest-of-world zone: it covers every address no other zone does, so it can&apos;t be deleted or deactivated. Edit its mode or rate instead.</p>
            <div className="flex justify-end">{cancelButton}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {guard.orderCount} {guard.orderCount === 1 ? "order was" : "orders were"} delivered through this zone, so it can&apos;t be deleted — those orders keep their record of it. Deactivate it
              instead: new addresses then resolve to another zone, and nothing already placed changes.
            </p>
            {deactivate.state && !deactivate.state.ok && <p className="text-destructive text-sm">{deactivate.state.error}</p>}
            <form action={deactivate.formAction} className="flex justify-end gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="isActive" value="false" />
              {cancelButton}
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
