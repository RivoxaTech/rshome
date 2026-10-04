"use client";

import { useState } from "react";
import Link from "next/link";
import { inputClass } from "@/components/panel/FormField";
import { Listbox } from "@/components/panel/Listbox";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/features/audit/actions";
import type { AuditListQuery } from "@/features/audit/schemas";

const ANY = "";

/**
 * The audit viewer's filters (S20): a plain GET `<form>` to the page itself, so applying a filter
 * is an ordinary navigation and the URL is shareable. The three Listboxes post through their own
 * hidden inputs (D52 — never a native `<select>`); blank values are left out of the URL by the
 * page's own schema. "Clear" is just a link to the bare page.
 */
export function AuditFilters({ query, actors }: { query: AuditListQuery; actors: { id: number; name: string }[] }) {
  const [user, setUser] = useState(query.user === undefined ? ANY : String(query.user));
  const [action, setAction] = useState(query.action ?? ANY);
  const [entity, setEntity] = useState(query.entity ?? ANY);
  const hasFilter = query.user !== undefined || !!query.action || !!query.entity || !!query.entityId || !!query.from || !!query.to;

  return (
    <form action="/panel/audit" method="get" className="bg-card border-border flex flex-col gap-3 rounded-lg border p-3 sm:p-4">
      {query.pageSize !== 25 && <input type="hidden" name="pageSize" value={query.pageSize} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Who
          <Listbox
            name="user"
            value={user}
            onChange={setUser}
            ariaLabel="Filter by user"
            items={[{ value: ANY, label: "Anyone" }, { value: "system", label: "System" }, ...actors.map((actor) => ({ value: String(actor.id), label: actor.name }))]}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Action
          <Listbox name="action" value={action} onChange={setAction} ariaLabel="Filter by action" items={[{ value: ANY, label: "Any action" }, ...AUDIT_ACTIONS.map((item) => ({ value: item.key, label: item.label }))]} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Entity
          <Listbox name="entity" value={entity} onChange={setEntity} ariaLabel="Filter by entity" items={[{ value: ANY, label: "Any entity" }, ...AUDIT_ENTITIES.map((item) => ({ value: item.key, label: item.label }))]} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Entity id
          <input name="entityId" defaultValue={query.entityId ?? ""} maxLength={50} placeholder="e.g. 42 or bank_accounts" className={`${inputClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          From (Karachi date)
          <input name="from" type="date" defaultValue={query.from ?? ""} className={`${inputClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          To (Karachi date, inclusive)
          <input name="to" type="date" defaultValue={query.to ?? ""} className={`${inputClass} w-full`} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium">
          Apply filters
        </button>
        {hasFilter && (
          <Link href="/panel/audit" className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm font-medium">
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}
