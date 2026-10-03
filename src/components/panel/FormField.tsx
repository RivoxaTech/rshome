/** The panel forms' text input look (shared by the S14 settings and shipping forms). */
export const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

/** A label, the control, and a hint or its field error underneath. */
export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

/** A refusal or a success line above the form's buttons. */
export function FormNotice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p role="status" className={`rounded-md border p-3 text-sm ${tone === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
      {children}
    </p>
  );
}
