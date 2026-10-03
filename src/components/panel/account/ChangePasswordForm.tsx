"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/app/panel/(protected)/account/actions";
import { PasswordInput } from "@/components/ui/PasswordInput";

const initialState: ChangePasswordState = undefined;

function Field({
  id,
  name,
  label,
  autoComplete,
  error,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <PasswordInput id={id} name={name} autoComplete={autoComplete} required aria-invalid={!!error} />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} key={state?.ok ? "done" : "form"} className="mt-3 flex max-w-sm flex-col gap-4">
      <Field id="currentPassword" name="currentPassword" label="Current password" autoComplete="current-password" error={state?.fieldErrors?.currentPassword} />
      <Field id="newPassword" name="newPassword" label="New password" autoComplete="new-password" error={state?.fieldErrors?.newPassword} />
      <Field
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        error={state?.fieldErrors?.confirmPassword}
      />

      {state && !state.ok && !state.fieldErrors && <p className="text-destructive text-sm">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">Password changed. Your other sessions were signed out.</p>}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
