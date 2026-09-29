import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

/** Storefront form controls: an underline input under a small tracked label, as in the coupon field. */
const LABEL = "text-muted-foreground block text-[10px] tracking-[0.28em] uppercase";
const CONTROL =
  "border-espresso/30 focus:border-espresso placeholder:text-muted-foreground w-full border-b bg-transparent py-3 text-sm outline-none transition-colors";
const INVALID = "border-destructive";

type FieldFrame = {
  id: string;
  label: string;
  /** Shown under the control when set; wins over `hint`. */
  error?: string | null;
  hint?: string | null;
  className?: string;
};

function Frame({ id, label, error, hint, className = "", optional, children }: FieldFrame & { optional: boolean; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL}>
        {label}
        {optional && <span className="normal-case tracking-normal"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive mt-2 text-xs leading-relaxed">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-muted-foreground mt-2 text-xs leading-relaxed">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function describedBy(id: string, error?: string | null, hint?: string | null): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export function TextField({ id, label, error, hint, className, ...input }: FieldFrame & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Frame id={id} label={label} error={error} hint={hint} className={className} optional={!input.required}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${error ? INVALID : ""}`}
        {...input}
      />
    </Frame>
  );
}

export function SelectField({
  id,
  label,
  error,
  hint,
  className,
  children,
  ...select
}: FieldFrame & SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <Frame id={id} label={label} error={error} hint={hint} className={className} optional={!select.required}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={`${CONTROL} cursor-pointer appearance-none pr-8 ${error ? INVALID : ""}`}
          {...select}
        >
          {children}
        </select>
        <Icon d={ICON_PATHS.chevronDown} className="pointer-events-none absolute top-1/2 right-0 h-4 w-4 -translate-y-1/2" />
      </div>
    </Frame>
  );
}

export function TextAreaField({ id, label, error, hint, className, ...textarea }: FieldFrame & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Frame id={id} label={label} error={error} hint={hint} className={className} optional={!textarea.required}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} min-h-24 resize-y ${error ? INVALID : ""}`}
        {...textarea}
      />
    </Frame>
  );
}
