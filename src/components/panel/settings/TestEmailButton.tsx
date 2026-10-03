"use client";

import { useActionState } from "react";
import { FormNotice } from "@/components/panel/FormField";
import type { NotifyList } from "@/features/settings/schemas";
import type { TestEmailResult } from "@/features/settings/staff-service";
import { sendTestEmailAction } from "@/app/panel/(protected)/settings/actions";

/**
 * "Send test email" for one recipient list: its own `<form>`, rendered beside (never inside) the
 * settings form (D49). Reports the server's honest result — sent, logged only (no SMTP in
 * development), or the transport's own error text. Sends to the list as last *saved*.
 */
export function TestEmailButton({ list, label }: { list: NotifyList; label: string }) {
  const [state, formAction, pending] = useActionState(sendTestEmailAction, null as TestEmailResult | null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="list" value={list} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
          {pending ? "Sending…" : label}
        </button>
        <span className="text-muted-foreground text-xs">Goes to the saved list, through the same mail service as the real alerts.</span>
      </div>
      {state && (state.ok ? <FormNotice tone="success">{state.message}</FormNotice> : <FormNotice tone="error">{state.error}</FormNotice>)}
    </form>
  );
}
