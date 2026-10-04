"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { PanelImage } from "@/features/catalog/images-staff-service";
import { deleteProductImageAction } from "@/app/panel/(protected)/products/[id]/actions";

/** A small confirm dialog, its own `<form>` outside any other form (D49/D54), mirroring `DeleteVariantDialog`. */
export function DeleteImageDialog({ image, onClose }: { image: PanelImage; onClose: () => void }) {
  const router = useRouter();
  const { state, formAction, pending } = useStaffAction(deleteProductImageAction, () => {
    onClose();
    router.refresh();
  });

  return (
    <Dialog open onClose={onClose} title="Delete image">
      <div className="flex flex-col gap-4">
        <p className="text-sm">This image will be removed from the product and its files deleted. This can&apos;t be undone.</p>
        {state && !state.ok && <p role="alert" className="text-destructive text-sm">{state.error}</p>}
        <form action={formAction} className="flex justify-end gap-2">
          <input type="hidden" name="imageId" value={image.id} />
          <button type="button" onClick={onClose} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            {pending ? "Deleting…" : "Delete"}
          </button>
        </form>
      </div>
    </Dialog>
  );
}
