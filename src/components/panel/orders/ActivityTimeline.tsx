import type { StaffOrderView } from "@/features/orders/staff-service";

function title(row: StaffOrderView["history"][number]): string {
  if (row.kind === "note") return "Internal note";
  const change = row.from ? `${row.from} → ${row.to}` : (row.to ?? "");
  return row.kind === "payment" ? `Payment: ${change}` : change;
}

/** Every `order_status_history` row, newest first, as a timeline: what changed, why, who and when. */
export function ActivityTimeline({ rows }: { rows: StaffOrderView["history"] }) {
  return (
    <ol className="grid">
      {rows.map((row, index) => (
        <li key={row.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < rows.length - 1 && <span aria-hidden="true" className="bg-border absolute top-4 bottom-0 left-[5px] w-px" />}
          <span
            aria-hidden="true"
            className={`relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${
              index === 0 ? "border-primary bg-primary" : row.kind === "note" ? "border-accent bg-card" : "border-border bg-card"
            }`}
          />
          <div className="min-w-0 text-[13px]">
            <p className="font-medium">{title(row)}</p>
            {row.note && <p className="text-foreground/85 mt-0.5 leading-relaxed break-words whitespace-pre-line">{row.note}</p>}
            <p className="text-muted-foreground mt-0.5 text-xs">
              {row.by} · {row.at}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
