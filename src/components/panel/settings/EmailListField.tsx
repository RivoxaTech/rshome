"use client";

import { useState } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { inputClass } from "@/components/panel/FormField";

/** Enough to catch a typo before the round trip; the server's Zod schema is the real check. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A chips editor for an owner-alert recipient list (S14): type an address and press Enter (or
 * comma, or leave the field) to add it, × to remove. Posts ONE hidden field (`name`) with the
 * addresses comma-separated — the literal wire format `recipientListSchema` reads. An empty list
 * is a real state: no email alerts for that event (owner decision C26).
 */
export function EmailListField({
  id,
  name,
  value,
  onChange,
  max,
  error,
  emptyLabel,
}: {
  id: string;
  name: string;
  value: string[];
  onChange: (emails: string[]) => void;
  max: number;
  error?: string;
  emptyLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const full = value.length >= max;

  function add() {
    const email = draft.trim().toLowerCase().replace(/[,;]+$/, "");
    if (!email) return;
    if (!LOOKS_LIKE_EMAIL.test(email)) {
      setDraftError(`"${email}" doesn't look like an email address.`);
      return;
    }
    if (!value.includes(email)) onChange([...value, email]);
    setDraft("");
    setDraftError(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value.join(",")} />

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Recipients">
          {value.map((email) => (
            <li key={email} className="bg-secondary text-foreground inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs">
              <span className="truncate">{email}</span>
              <button type="button" aria-label={`Remove ${email}`} onClick={() => onChange(value.filter((other) => other !== email))} className="hover:bg-background/70 rounded-full p-0.5">
                <Icon d={ICON_PATHS.close} className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bg-muted text-muted-foreground inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs">
          <span className="bg-muted-foreground/60 h-1.5 w-1.5 rounded-full" />
          {emptyLabel}
        </p>
      )}

      <div className="flex gap-2">
        <input
          id={id}
          type="email"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setDraftError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
          onBlur={add}
          disabled={full}
          placeholder={full ? `Up to ${max} addresses` : "name@example.com"}
          aria-label="Add an email address"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="button" onClick={add} disabled={full || !draft.trim()} className="border-input hover:bg-secondary rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">
          Add
        </button>
      </div>
      <p className="text-muted-foreground text-xs">
        {value.length} of {max}. Press Enter or Add after each address.
      </p>
      {(draftError || error) && <p className="text-destructive text-xs">{draftError ?? error}</p>}
    </div>
  );
}
