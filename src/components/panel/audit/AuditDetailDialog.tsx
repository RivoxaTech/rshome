"use client";

import { Dialog } from "@/components/panel/Dialog";
import { buildAuditDiff } from "@/features/audit/diff";
import type { AuditListItem } from "@/features/audit/staff-service";

/** A value cell: pre-formatted text (React escapes it — never HTML), "—" for a missing side. */
function Value({ text, highlight }: { text: string | null; highlight: boolean }) {
  if (text === null) return <span className="text-muted-foreground">—</span>;
  return <pre className={`font-mono text-xs break-words whitespace-pre-wrap ${highlight ? "" : "text-muted-foreground"}`}>{text}</pre>;
}

/**
 * One audit row's before/after as a readable key/value diff (S20): every key from either side,
 * changed keys highlighted. The diff is computed in the browser from the row's raw JSON text
 * (`features/audit/diff.ts`, pure), so the list payload stays small and the dialog needs no
 * round trip.
 */
export function AuditDetailDialog({ item, onClose }: { item: AuditListItem | null; onClose: () => void }) {
  const diff = item ? buildAuditDiff(item.oldValues, item.newValues) : null;
  const changedCount = diff?.kind === "diff" ? diff.rows.filter((row) => row.changed).length : 0;

  return (
    <Dialog open={!!item} onClose={onClose} title={item ? item.actionLabel : ""} widthClassName="max-w-3xl">
      {item && diff && (
        <div className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">When</dt>
            <dd>{item.at} (Karachi)</dd>
            <dt className="text-muted-foreground">Who</dt>
            <dd>{item.actor}</dd>
            <dt className="text-muted-foreground">Action</dt>
            <dd className="font-mono text-xs">{item.action}</dd>
            <dt className="text-muted-foreground">Entity</dt>
            <dd>
              {item.entityLabel} <span className="text-muted-foreground font-mono text-xs">#{item.entityId}</span>
            </dd>
          </dl>

          {diff.kind === "diff" ? (
            diff.rows.length === 0 ? (
              <p className="text-muted-foreground">No values were recorded for this entry.</p>
            ) : (
              <div className="border-border overflow-x-auto rounded-md border">
                <table className="w-full border-separate border-spacing-0 text-left">
                  <thead>
                    <tr className="bg-muted/60 text-muted-foreground text-xs">
                      <th className="px-3 py-2 font-medium">Field</th>
                      <th className="px-3 py-2 font-medium">Before</th>
                      <th className="px-3 py-2 font-medium">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.rows.map((row) => (
                      <tr key={row.key} className={`border-border border-t align-top ${row.changed ? "bg-amber-500/10" : ""}`}>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                          {row.key}
                          {row.changed && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" aria-label="changed" />}
                        </td>
                        <td className="max-w-[18rem] px-3 py-2">
                          <Value text={row.oldValue} highlight={row.changed} />
                        </td>
                        <td className="max-w-[18rem] px-3 py-2">
                          <Value text={row.newValue} highlight={row.changed} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium">Before</p>
                <Value text={diff.oldText} highlight />
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium">After</p>
                <Value text={diff.newText} highlight />
              </div>
            </div>
          )}

          {diff.kind === "diff" && diff.rows.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {changedCount > 0
                ? `${changedCount} ${changedCount === 1 ? "field" : "fields"} changed.`
                : item.oldValues === null || item.newValues === null
                  ? "One side only: a create records the new values, a delete the old ones."
                  : "Both sides were recorded and nothing differs between them."}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
