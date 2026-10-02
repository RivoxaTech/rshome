"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { PanelVariant } from "@/features/catalog/variants-staff-service";
import { deleteVariantAction, setVariantActiveAction } from "@/app/panel/(protected)/products/[id]/actions";

/**
 * Delete confirmation. A variant on any past order can't be deleted (the server refuses it too):
 * the dialog says so up front and offers Deactivate instead. Every other rule (the last variant,
 * the last active one of an active product) comes back from the Server Action as a message.
 */
export function DeleteVariantDialog({ variant, onClose }: { variant: PanelVariant; onClose: () => void }) {
  const router = useRouter();
  const done = () => {
    onClose();
    router.refresh();
  };
  const remove = useStaffAction(deleteVariantAction, done);
  const deactivate = useStaffAction(setVariantActiveAction, done);

  return (
    <Dialog open onClose={onClose} title={`Delete “${variant.label}”`}>
      {variant.ordered ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">This variant appears on past orders, so it can&apos;t be deleted. Deactivate it instead to take it off the storefront while keeping those orders intact.</p>
          {deactivate.state && !deactivate.state.ok && <p className="text-destructive text-sm">{deactivate.state.error}</p>}
          <form action={deactivate.formAction} className="flex justify-end gap-2">
            <input type="hidden" name="variantId" value={variant.id} />
            <input type="hidden" name="isActive" value="false" />
            <button type="button" onClick={onClose} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
              Close
            </button>
            {variant.isActive && (
              <button type="submit" disabled={deactivate.pending} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                {deactivate.pending ? "Saving…" : "Deactivate instead"}
              </button>
            )}
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            SKU <span className="font-mono">{variant.sku}</span> and its stock of {variant.stock} will be removed. This can&apos;t be undone.
          </p>
          {remove.state && !remove.state.ok && <p className="text-destructive text-sm">{remove.state.error}</p>}
          <form action={remove.formAction} className="flex justify-end gap-2">
            <input type="hidden" name="variantId" value={variant.id} />
            <button type="button" onClick={onClose} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={remove.pending} className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              {remove.pending ? "Deleting…" : "Delete"}
            </button>
          </form>
        </div>
      )}
    </Dialog>
  );
}
