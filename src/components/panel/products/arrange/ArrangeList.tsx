"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoveToControl } from "@/components/panel/MoveToControl";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { ArrangeItem } from "@/features/catalog/arrange-service";
import {
  moveFeaturedProductAction,
  moveShopProductAction,
  saveFeaturedOrderAction,
  saveShopOrderAction,
} from "@/app/panel/(protected)/products/arrange/actions";

export type ArrangeScope = { kind: "shop"; categoryId?: number } | { kind: "featured" };

const STATUS_LABEL: Record<ArrangeItem["status"], string> = { active: "Active", draft: "Draft", archived: "Archived" };

/** The per-row move, through the shared `MoveToControl` (S10 phase 3a generalised it out of here for the variants card). */
function ArrangeMove({ scope, item, total }: { scope: ArrangeScope; item: ArrangeItem; total: number }) {
  const hiddenFields: Record<string, string | number> = { productId: item.id };
  if (scope.kind === "shop" && scope.categoryId !== undefined) hiddenFields.categoryId = scope.categoryId;
  return <MoveToControl action={scope.kind === "shop" ? moveShopProductAction : moveFeaturedProductAction} hiddenFields={hiddenFields} total={total} itemName={item.name} />;
}

function ArrangeRow({ scope, item, total }: { scope: ArrangeScope; item: ArrangeItem; total: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const muted = item.status !== "active";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-card border-border flex items-center gap-3 rounded-lg border p-2.5 ${isDragging ? "opacity-60" : ""}`}
    >
      <button type="button" {...attributes} {...listeners} aria-label={`Drag to reorder ${item.name}`} className="text-muted-foreground hover:text-foreground cursor-grab touch-none p-1 active:cursor-grabbing">
        <Icon d={ICON_PATHS.grip} className="h-4 w-4" />
      </button>
      {item.imagePath ? (
        <Image src={item.imagePath} alt={item.name} width={36} height={36} className="h-9 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
          <Icon d={ICON_PATHS.box} className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${muted ? "text-muted-foreground" : "font-medium"}`}>{item.name}</p>
        {muted && <p className="text-muted-foreground text-xs">{STATUS_LABEL[item.status]}</p>}
      </div>
      <ArrangeMove scope={scope} item={item} total={total} />
    </li>
  );
}

/**
 * Touch-friendly drag-and-drop (S10 phase 2b): drops and per-row moves save immediately (the
 * panel's usual quick-action convention, no separate explicit Save step). `items` resyncs local
 * state whenever fresh server data arrives (a sibling row's move action refreshing the page).
 */
export function ArrangeList({ scope, items }: { scope: ArrangeScope; items: ArrangeItem[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(items);
  // Resyncs from fresh server data (e.g. a sibling row's move action refreshing the page) without
  // an effect — React's documented pattern for "adjust state when a prop changes" (react.dev).
  const [renderedItems, setRenderedItems] = useState(items);
  if (items !== renderedItems) {
    setRenderedItems(items);
    setOrder(items);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = order.findIndex((item) => item.id === active.id);
    const toIndex = order.findIndex((item) => item.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = arrayMove(order, fromIndex, toIndex);
    setOrder(next);
    setSaving(true);
    setError(null);

    const orderedIds = next.map((item) => item.id);
    let result: Awaited<ReturnType<typeof saveShopOrderAction>>;
    try {
      result = scope.kind === "shop" ? await saveShopOrderAction({ categoryId: scope.categoryId, orderedIds }) : await saveFeaturedOrderAction({ orderedIds });
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

  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No products here.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="h-4 text-xs">
        {saving && <span className="text-muted-foreground">Saving…</span>}
        {error && <span className="text-destructive">{error}</span>}
      </div>
      <DndContext id={`arrange-${scope.kind}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {order.map((item) => (
              <ArrangeRow key={item.id} scope={scope} item={item} total={order.length} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
