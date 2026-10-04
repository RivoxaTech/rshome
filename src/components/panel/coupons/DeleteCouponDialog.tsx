"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { CouponDeleteGuard, StaffActionResult } from "@/features/coupons/staff-service";
import { deleteCouponAction, setCouponActiveAction } from "@/app/panel/(protected)/coupons/actions";

/**
 * The edit page's Delete button: refused with the order count (and a "Deactivate instead"
 * shortcut) once any order has used the coupon, otherwise a plain confirm — the same pattern as
 * an ordered variant (`DeleteVariantDialog`). The server refuses regardless of what's shown.
 */
export function DeleteCouponDialog({ id, code, isActive, guard }: { id: number; code: string; isActive: boolean; guard: CouponDeleteGuard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteCouponAction, null as StaffActionResult | null);
  const deactivate = useStaffAction(setCouponActiveAction, () => {
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-destructive hover:bg-destructive/10 rounded-md px-3 py-2 text-sm font-medium">
        Delete
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${code}`}>
        {guard.allowed ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">No order has used this coupon yet, so it can be removed. This can&apos;t be undone.</p>
            {deleteState && !deleteState.ok && <p role="alert" className="text-destructive text-sm">{deleteState.error}</p>}
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
            <p className="text-sm">
              {Math.max(guard.usageCount, guard.orderCount)} {Math.max(guard.usageCount, guard.orderCount) === 1 ? "order has" : "orders have"} used this coupon, so it
              can&apos;t be deleted — those orders keep their record of it. Deactivate it instead to stop any further use.
            </p>
            {deactivate.state && !deactivate.state.ok && <p role="alert" className="text-destructive text-sm">{deactivate.state.error}</p>}
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
