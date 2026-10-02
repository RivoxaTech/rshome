"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoveToControl } from "@/components/panel/MoveToControl";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { PanelImage } from "@/features/catalog/images-staff-service";
import { makeImagePrimaryAction, moveImageAction, setImageAltAction } from "@/app/panel/(protected)/products/[id]/actions";

/** Saves on blur, or the small Save button that appears once the text actually changed. */
function AltField({ image, onError }: { image: PanelImage; onError: (message: string | null) => void }) {
  const router = useRouter();
  const { state, formAction, pending } = useStaffAction(setImageAltAction, () => router.refresh());
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(image.alt ?? "");
  // Resyncs to fresh server data (this save, or another card's action refreshing the page).
  const [renderedAlt, setRenderedAlt] = useState(image.alt);
  if (image.alt !== renderedAlt) {
    setRenderedAlt(image.alt);
    setValue(image.alt ?? "");
  }
  const changed = value.trim() !== (image.alt ?? "");
  const error = state && !state.ok ? (state.fieldErrors?.alt ?? state.error) : null;
  useEffect(() => onError(error), [error, onError]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex items-center gap-1"
      onSubmit={(event) => {
        if (!changed) event.preventDefault();
      }}
    >
      <input type="hidden" name="imageId" value={image.id} />
      <input
        type="text"
        name="alt"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (changed) formRef.current?.requestSubmit();
        }}
        maxLength={255}
        placeholder="Alt text"
        aria-label={`Alt text for image ${image.position}`}
        className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
      />
      {changed && (
        <button type="submit" disabled={pending} className="bg-primary text-primary-foreground shrink-0 rounded-md px-1.5 py-1 text-xs font-medium disabled:opacity-50">
          {pending ? "…" : "Save"}
        </button>
      )}
    </form>
  );
}

export function ImageCard({ image, total, onDelete }: { image: PanelImage; total: number; onDelete: () => void }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const [cardError, setCardError] = useState<string | null>(null);
  const makePrimary = useStaffAction(makeImagePrimaryAction, () => router.refresh());
  const isPrimary = image.position === 1;
  const primaryError = makePrimary.state && !makePrimary.state.ok ? makePrimary.state.error : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-card border-border flex flex-col gap-2 rounded-lg border p-2 ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="bg-muted relative aspect-square overflow-hidden rounded-md">
        <Image src={image.path} alt={image.alt ?? ""} width={image.width} height={image.height} sizes="200px" className="h-full w-full object-cover" />
        {isPrimary && (
          <span className="bg-primary text-primary-foreground absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
            <Icon d={ICON_PATHS.star} className="h-3 w-3" />
            Primary
          </span>
        )}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder image ${image.position}`}
          className="absolute top-1.5 right-1.5 cursor-grab touch-none rounded-md bg-black/40 p-1 text-white active:cursor-grabbing"
        >
          <Icon d={ICON_PATHS.grip} className="h-3.5 w-3.5" />
        </button>
      </div>

      <AltField image={image} onError={setCardError} />

      <div className="flex items-center justify-between gap-1">
        {!isPrimary && (
          <form action={makePrimary.formAction}>
            <input type="hidden" name="imageId" value={image.id} />
            <button type="submit" disabled={makePrimary.pending} className="text-primary text-[11px] font-medium hover:underline disabled:opacity-50">
              {makePrimary.pending ? "…" : "Make primary"}
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete image ${image.position}`}
          title="Delete"
          className="text-destructive hover:bg-destructive/10 ml-auto rounded-md p-1.5"
        >
          <Icon d={ICON_PATHS.trash} className="h-3.5 w-3.5" />
        </button>
      </div>

      <MoveToControl action={moveImageAction} hiddenFields={{ imageId: image.id }} total={total} itemName={`image ${image.position}`} />

      {(cardError || primaryError) && <p className="text-destructive text-[11px]">{cardError ?? primaryError}</p>}
    </li>
  );
}
