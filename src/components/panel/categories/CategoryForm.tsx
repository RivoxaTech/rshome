"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateSlug } from "@/features/catalog/slug";
import type { ParentOption, StaffActionResult } from "@/features/catalog/staff-service";
import { CategoryImageField } from "@/components/panel/categories/CategoryImageField";
import { Switch } from "@/components/panel/Switch";

export type CategoryFormValues = {
  id: number | null;
  name: string;
  slug: string;
  description: string | null;
  imagePath: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: number | null;
};

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

export function CategoryForm({
  mode,
  initial,
  parentOptions,
  hasChildren,
  action,
  backHref,
  deleteSlot,
}: {
  mode: "create" | "edit";
  initial: CategoryFormValues;
  parentOptions: ParentOption[];
  hasChildren: boolean;
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  /** Where Cancel returns to: the categories list, with the search/page/rows the user came from. */
  backHref: string;
  /** The edit page's delete button + confirmation dialog; absent in create mode. */
  deleteSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const slugTouched = useRef(mode === "edit");
  const [isActive, setIsActive] = useState(initial.isActive);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {mode === "edit" && <input type="hidden" name="id" value={initial.id ?? ""} />}

        <Field id="name" label="Name" error={fieldErrors?.name}>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(event) => {
              const value = event.target.value;
              setName(value);
              if (!slugTouched.current) setSlug(generateSlug(value));
            }}
            required
            maxLength={150}
            className={inputClass}
          />
        </Field>

        <Field id="slug" label="Slug" error={fieldErrors?.slug}>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(event) => {
              slugTouched.current = true;
              setSlug(event.target.value);
            }}
            required
            maxLength={191}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className={`${inputClass} font-mono`}
          />
          <p className="text-muted-foreground text-xs">Lowercase letters, numbers and single dashes, e.g. tea-sets.</p>
        </Field>

        <Field id="description" label="Short description" error={fieldErrors?.description}>
          <textarea id="description" name="description" defaultValue={initial.description ?? ""} rows={3} maxLength={500} className={inputClass} />
        </Field>

        <CategoryImageField name="imagePath" initialPath={initial.imagePath} error={fieldErrors?.imagePath} />

        <Field id="parentId" label="Parent category" error={fieldErrors?.parentId}>
          <select
            id="parentId"
            name="parentId"
            defaultValue={initial.parentId ?? ""}
            disabled={hasChildren}
            className={`${inputClass} disabled:opacity-50`}
          >
            <option value="">No parent</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          {hasChildren && (
            <p className="text-muted-foreground text-xs">This category has sub-categories, so it can&apos;t be given a parent itself.</p>
          )}
        </Field>

        <Field id="sortOrder" label="Sort order" error={fieldErrors?.sortOrder}>
          <input id="sortOrder" name="sortOrder" type="number" defaultValue={initial.sortOrder} min={0} max={100_000} step={1} className={inputClass} />
          <p className="text-muted-foreground text-xs">Lower numbers show first.</p>
        </Field>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Active</span>
          <Switch name="isActive" checked={isActive} onChange={setIsActive} />
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">Hidden categories (and any sub-categories under a hidden parent) disappear from the storefront.</p>

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {pending ? "Saving…" : mode === "create" ? "Create category" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="border-input hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Outside the form above: it has its own nested `<form>` (delete/hide), and nesting
          `<form>` elements is invalid HTML that silently breaks which one a submit actually
          reaches (found live: Delete did nothing when this sat inside the save form). */}
      {deleteSlot && <div className="border-border border-t pt-4">{deleteSlot}</div>}
    </div>
  );
}
