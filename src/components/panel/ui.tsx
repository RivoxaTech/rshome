import type { ReactNode } from "react";
import type { PaymentStatus } from "@/features/orders/status";
import type { OrderTab } from "@/features/orders/transitions";

/**
 * Panel primitives (C21): the storefront's palette in a clean admin style: white cards with soft
 * corners, a sans-serif, 44 px touch targets on phones. Classes are exported for native
 * controls, so forms stay plain HTML that works before hydration.
 */
export const LABEL = "mb-1.5 block text-sm font-medium";
const FIELD =
  "border-input bg-card placeholder:text-muted-foreground focus:border-primary focus:ring-primary/15 w-full rounded-md border px-3 text-base outline-none transition focus:ring-4 sm:text-sm";
export const INPUT = `${FIELD} h-11 sm:h-10`;
export const TEXTAREA = `${FIELD} py-2`;

const BUTTON_BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 sm:h-10";
export const BUTTON = {
  primary: `${BUTTON_BASE} bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm`,
  secondary: `${BUTTON_BASE} border-border bg-card hover:bg-muted border`,
  danger: `${BUTTON_BASE} bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm`,
  dangerOutline: `${BUTTON_BASE} border-status-rejected-foreground/30 text-status-rejected-foreground hover:bg-status-rejected border`,
} as const;
export const ICON_BUTTON =
  "text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-card border-border rounded-xl border shadow-sm ${className}`}>
      {title && (
        <header className="flex min-h-12 items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <h2 className="text-base">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** A status colour: the tab's, which payment statuses borrow too. */
export type Tone = OrderTab;

export const TONE_CLASSES: Record<Tone, string> = {
  need_review: "bg-status-review text-status-review-foreground",
  pending_delivery: "bg-status-pending text-status-pending-foreground",
  processing: "bg-status-processing text-status-processing-foreground",
  delivery: "bg-status-delivery text-status-delivery-foreground",
  completed: "bg-status-completed text-status-completed-foreground",
  cancelled: "bg-status-cancelled text-status-cancelled-foreground",
  rejected: "bg-status-rejected text-status-rejected-foreground",
};

export const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  unpaid: "pending_delivery",
  proof_submitted: "need_review",
  verified: "completed",
  rejected: "rejected",
  cod_pending: "cancelled",
  cod_collected: "completed",
};

const PILL = "ring-current/15 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset";

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`${PILL} ${TONE_CLASSES[tone]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`bg-accent/25 text-foreground inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}>
      {initials(name)}
    </span>
  );
}

/** A Server Action's refusal. */
export function ActionMessage({ state }: { state: { ok: boolean; error?: string } | null }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="bg-status-rejected text-status-rejected-foreground rounded-md px-3 py-2 text-sm leading-relaxed">
      {state.error}
    </p>
  );
}

/** A label that shows on hover and keyboard focus, beside an icon-only control (which carries its own aria-label). */
export function Tooltip({ label, children, side = "bottom" }: { label: string; children: ReactNode; side?: "bottom" | "top" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        className={`bg-foreground text-background pointer-events-none absolute right-0 z-30 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100 ${
          side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
