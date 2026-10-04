import { cloneElement, isValidElement, type ReactElement } from "react";

/** The panel forms' text input look (shared by the S14 settings and shipping forms). */
export const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

const NATIVE_CONTROLS = new Set(["input", "textarea", "select"]);

/**
 * Wires a native control to the field's message: `aria-describedby` points at the error (or the
 * hint) and `aria-invalid` is set while there is an error. Composite children (a Listbox, a
 * wrapper div) are left alone: they are not the control and carry their own messages.
 */
function describe(children: React.ReactNode, id: string, error?: string, hint?: string): React.ReactNode {
  if (!isValidElement(children) || typeof children.type !== "string" || !NATIVE_CONTROLS.has(children.type)) return children;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  });
}

/** A label, the control, and a hint or its field error underneath (the error is announced, S22 QA-02). */
export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {describe(children, id, error, hint)}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

/** A refusal (announced at once) or a success line (polite) above the form's buttons. */
export function FormNotice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border p-3 text-sm ${tone === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}
    >
      {children}
    </p>
  );
}
