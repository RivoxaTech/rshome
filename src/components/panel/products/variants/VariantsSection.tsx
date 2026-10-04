"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DetailCard } from "@/components/panel/DetailCard";
import type { PanelVariant } from "@/features/catalog/variants-staff-service";
import type { ProductStatus } from "@/features/catalog/schemas";
import { saveVariantOrderAction } from "@/app/panel/(protected)/products/[id]/actions";
import { DeleteVariantDialog } from "./DeleteVariantDialog";
import { VariantDialog } from "./VariantDialog";
import { VARIANT_GRID, VariantRow } from "./VariantRow";

type VariantsProduct = { id: number; name: string; price: string; status: ProductStatus };

/**
 * The edit page's variants card (S10): its own section *below and outside* the product
 * save form — every control here (the dialogs, the inline stock form, the move form) is a
 * `<form>` of its own, which must never sit inside another form (CLAUDE.md UI rules, D49).
 * Drops and per-row moves save immediately, like the arrange page; `variants` resyncs local
 * state whenever fresh server data arrives (any action here calls `router.refresh()`).
 */
export function VariantsSection({ product, variants }: { product: VariantsProduct; variants: PanelVariant[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(variants);
  // React's documented "adjust state when a prop changes" pattern (no effect), as in ArrangeList.
  const [renderedVariants, setRenderedVariants] = useState(variants);
  if (variants !== renderedVariants) {
    setRenderedVariants(variants);
    setOrder(variants);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "edit"; variant: PanelVariant } | { kind: "delete"; variant: PanelVariant } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = order.findIndex((variant) => variant.id === active.id);
    const toIndex = order.findIndex((variant) => variant.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = arrayMove(order, fromIndex, toIndex).map((variant, index) => ({ ...variant, position: index + 1 }));
    setOrder(next);
    setSaving(true);
    setError(null);
    let result: Awaited<ReturnType<typeof saveVariantOrderAction>>;
    try {
      result = await saveVariantOrderAction({ productId: product.id, orderedIds: next.map((variant) => variant.id) });
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

  const activeCount = order.filter((variant) => variant.isActive).length;

  return (
    <>
      <DetailCard
        title={`Variants (${order.length})`}
        action={
          <button type="button" onClick={() => setDialog({ kind: "add" })} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-xs font-medium">
            Add variant
          </button>
        }
      >
        <p className="text-muted-foreground -mt-1 text-xs">
          Each variant has its own SKU and stock. A blank price means the product price applies. {activeCount} of {order.length} active.
        </p>
        <div className="h-4 text-xs">
          {saving && <span className="text-muted-foreground">Saving…</span>}
          {error && <span className="text-destructive">{error}</span>}
        </div>
        <DndContext id={`variants-${product.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order.map((variant) => variant.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              <li className={`text-muted-foreground hidden px-3 text-xs ${VARIANT_GRID}`} aria-hidden="true">
                <span />
                <span>#</span>
                <span>Variant</span>
                <span>Price</span>
                <span>Stock</span>
                <span>Weight</span>
                <span>Status</span>
                <span />
              </li>
              {order.map((variant) => (
                <VariantRow
                  key={variant.id}
                  variant={variant}
                  productPrice={product.price}
                  total={order.length}
                  onEdit={() => setDialog({ kind: "edit", variant })}
                  onDelete={() => setDialog({ kind: "delete", variant })}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </DetailCard>

      {/* Mounted only while open, so each dialog starts from a fresh form state. */}
      {dialog?.kind === "add" && <VariantDialog mode="add" productId={product.id} productPrice={product.price} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <VariantDialog mode="edit" productId={product.id} productPrice={product.price} variant={dialog.variant} onClose={() => setDialog(null)} />}
      {dialog?.kind === "delete" && <DeleteVariantDialog variant={dialog.variant} onClose={() => setDialog(null)} />}
    </>
  );
}
