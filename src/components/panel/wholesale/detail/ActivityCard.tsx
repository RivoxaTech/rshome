"use client";

import { useRef } from "react";
import { addWholesaleNoteAction } from "@/app/panel/(protected)/wholesale/actions";
import { DetailCard } from "@/components/panel/DetailCard";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { StaffWholesaleInquiryView } from "@/features/wholesale/staff-service";

function HistoryRow({ row }: { row: StaffWholesaleInquiryView["activity"][number] }) {
  const change = row.kind === "note" ? null : row.from ? `${row.from} → ${row.to}` : row.to;
  return (
    <li className="border-border relative border-l pl-4">
      <span className="bg-border absolute top-1.5 -left-[3px] h-1.5 w-1.5 rounded-full" />
      <p className="text-xs">
        <span className="font-medium">{row.by}</span>
        <span className="text-muted-foreground"> · {row.at}</span>
      </p>
      {change && <p className="mt-0.5 text-sm">{change}</p>}
      {row.note && <p className="text-muted-foreground mt-0.5 text-sm">{row.note}</p>}
    </li>
  );
}

export function ActivityCard({
  id,
  activity,
  canAddNote,
}: {
  id: number;
  activity: StaffWholesaleInquiryView["activity"];
  canAddNote: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, formAction, pending } = useStaffAction(addWholesaleNoteAction, () => formRef.current?.reset());

  return (
    <DetailCard title="Activity">
      {canAddNote && (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <textarea
            name="note"
            rows={2}
            placeholder="Add an internal note (staff only)"
            className="border-input bg-background rounded-lg border px-3 py-2 text-sm"
          />
          {state?.ok === false && <p className="text-destructive text-sm">{state.error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="bg-secondary text-secondary-foreground rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add note"}
            </button>
          </div>
        </form>
      )}
      <ul className="flex max-h-80 flex-col gap-2.5 overflow-y-auto">
        {activity.map((row) => (
          <HistoryRow key={row.id} row={row} />
        ))}
      </ul>
    </DetailCard>
  );
}
