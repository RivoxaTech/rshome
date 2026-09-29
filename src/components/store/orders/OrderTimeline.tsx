import type { TimelineStep } from "@/features/orders/status";

const MARKER = {
  done: "bg-espresso border-espresso",
  current: "bg-champagne border-champagne",
  upcoming: "bg-background border-border",
} as const;

/** The friendly status steps (REQUIREMENTS SF-06), a filled marker per completed step. */
export function OrderTimeline({ steps, className = "" }: { steps: TimelineStep[]; className?: string }) {
  return (
    <ol className={className}>
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === "current" ? "step" : undefined}
          className="relative flex gap-5 pb-8 last:pb-0"
        >
          {index < steps.length - 1 && (
            <span aria-hidden="true" className={`absolute top-4 left-[7px] h-full w-px ${step.state === "done" ? "bg-espresso" : "bg-border"}`} />
          )}
          <span aria-hidden="true" className={`relative mt-0.5 h-4 w-4 shrink-0 rounded-full border ${MARKER[step.state]}`} />
          <div>
            <p className={`text-[11px] tracking-[0.22em] uppercase ${step.state === "upcoming" ? "text-muted-foreground" : ""}`}>
              {step.label}
            </p>
            {step.note && <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{step.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
