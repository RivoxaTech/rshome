"use client";

import { useState } from "react";
import { AuditDetailDialog } from "@/components/panel/audit/AuditDetailDialog";
import type { AuditListItem } from "@/features/audit/staff-service";

/** The audit rows (S20): a table on desktop, cards on phones; any row opens the before/after dialog. */
export function AuditTable({ items }: { items: AuditListItem[] }) {
  const [openItem, setOpenItem] = useState<AuditListItem | null>(null);

  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No audit entries match these filters.</p>;
  }

  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="rounded-l-lg px-3 py-2 font-medium">Time (Karachi)</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="rounded-r-lg px-3 py-2 font-medium">Entity id</th>
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:pt-4">
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setOpenItem(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setOpenItem(item);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open details of ${item.actionLabel}`}
                  className="border-border hover:bg-secondary/50 focus-visible:bg-secondary/50 cursor-pointer border-b outline-none last:border-b-0"
                >
                  <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">{item.at}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{item.actor}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{item.actionLabel}</span>
                    <span className="text-muted-foreground block font-mono text-xs">{item.action}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{item.entityLabel}</td>
                  <td className="px-3 py-2 font-mono text-xs break-all">{item.entityId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => setOpenItem(item)} className="bg-card border-border hover:bg-secondary/50 w-full rounded-lg border p-3.5 text-left">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-medium">{item.actionLabel}</span>
                <span className="text-muted-foreground shrink-0 text-xs">{item.at}</span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {item.actor} · {item.entityLabel} <span className="font-mono">#{item.entityId}</span>
              </p>
            </button>
          </li>
        ))}
      </ul>

      <AuditDetailDialog item={openItem} onClose={() => setOpenItem(null)} />
    </>
  );
}
