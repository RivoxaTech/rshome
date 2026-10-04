"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { DetailCard } from "@/components/panel/DetailCard";
import { MAX_PRODUCT_IMAGES } from "@/features/catalog/schemas";
import type { PanelImage } from "@/features/catalog/images-staff-service";
import { saveImageOrderAction } from "@/app/panel/(protected)/products/[id]/actions";
import { DeleteImageDialog } from "./DeleteImageDialog";
import { ImageCard } from "./ImageCard";
import { ImageUploader } from "./ImageUploader";

/**
 * The edit page's images card (S10, ARCHITECTURE.md D54): its own section *below and
 * outside* the product save form, exactly like the Variants card — every control here (the
 * uploader, the alt field, the move form, the delete dialog) is a `<form>` of its own, which must
 * never sit inside another form (CLAUDE.md UI rules, D49). Drops and per-row moves save
 * immediately; `images` resyncs local state whenever fresh server data arrives (any action here
 * calls `router.refresh()`).
 */
export function ImagesSection({ productId, images }: { productId: number; images: PanelImage[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(images);
  // React's documented "adjust state when a prop changes" pattern (no effect), as in VariantsSection.
  const [renderedImages, setRenderedImages] = useState(images);
  if (images !== renderedImages) {
    setRenderedImages(images);
    setOrder(images);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PanelImage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = order.findIndex((image) => image.id === active.id);
    const toIndex = order.findIndex((image) => image.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = arrayMove(order, fromIndex, toIndex).map((image, index) => ({ ...image, position: index + 1 }));
    setOrder(next);
    setSaving(true);
    setError(null);
    let result: Awaited<ReturnType<typeof saveImageOrderAction>>;
    try {
      result = await saveImageOrderAction({ productId, orderedIds: next.map((image) => image.id) });
    } catch {
      result = { ok: false, error: "Could not save the new order. Check your connection and try again." };
    }
    setSaving(false);
    if (!result.ok) {
      setOrder(order);
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <DetailCard title={`Images (${order.length})`}>
        <p className="text-muted-foreground -mt-1 text-xs">Up to {MAX_PRODUCT_IMAGES} photos. The first one is the primary image shown on the shop grid, search and orders.</p>

        <ImageUploader productId={productId} remaining={Math.max(0, MAX_PRODUCT_IMAGES - order.length)} onAdded={() => router.refresh()} onError={setError} />

        <div className="h-4 text-xs">
          {saving && <span className="text-muted-foreground">Saving…</span>}
          {error && <span role="alert" className="text-destructive">{error}</span>}
        </div>

        {order.length > 0 && (
          <DndContext id={`images-${productId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order.map((image) => image.id)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {order.map((image) => (
                  <ImageCard key={image.id} image={image} total={order.length} onDelete={() => setDeleteTarget(image)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </DetailCard>

      {/* Mounted only while open, so it starts from a fresh form state each time. */}
      {deleteTarget && <DeleteImageDialog image={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </>
  );
}
