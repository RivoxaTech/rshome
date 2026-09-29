"use client";

import { useActionState } from "react";
import { trackOrderAction } from "@/app/(store)/track/actions";
import { Button } from "@/components/store/Button";
import { TextField } from "@/components/store/forms/fields";

/** Order number plus checkout phone (REQUIREMENTS SF-07); a match redirects to the order page. */
export function TrackForm({ initialOrderNumber }: { initialOrderNumber: string }) {
  const [state, formAction, pending] = useActionState(trackOrderAction, undefined);

  return (
    <form action={formAction} className="mt-10 grid max-w-md gap-6">
      <TextField
        id="orderNumber"
        name="orderNumber"
        label="Order number"
        required
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="RSH-260929-ABCD"
        defaultValue={initialOrderNumber}
        className="[&_input]:tracking-widest [&_input]:uppercase"
      />
      <TextField
        id="phone"
        name="phone"
        label="Phone / WhatsApp"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        required
        placeholder="03XX XXXXXXX"
        hint="The number you gave at checkout."
      />
      {state?.error && (
        <p role="alert" className="border-destructive text-destructive border-l-2 pl-4 text-xs leading-relaxed">
          {state.error}
        </p>
      )}
      <div className="mt-2 grid sm:justify-start">
        <Button type="submit" disabled={pending}>
          {pending ? "Looking up…" : "Find my order"}
        </Button>
      </div>
    </form>
  );
}
