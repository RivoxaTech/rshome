"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { FormNotice } from "@/components/panel/FormField";
import { TemporaryPasswordField } from "@/components/panel/users/TemporaryPasswordField";
import { CopyButton } from "@/components/ui/CopyButton";
import { MIN_PASSWORD_LENGTH } from "@/features/users/schemas";
import type { StaffActionResult } from "@/features/users/staff-service";
import { resetUserPasswordAction } from "@/app/panel/(protected)/users/actions";

/**
 * The edit page's "Reset password" (S20): a dialog with a typed-or-generated temporary password,
 * its own `<form>` outside the save form (D49). Success shows the password once (it never comes
 * back from the server) and notes that every session of that user has been signed out.
 */
export function ResetPasswordDialog({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState(resetUserPasswordAction, null as StaffActionResult | null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  function close() {
    setOpen(false);
    if (state?.ok) router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="border-input hover:bg-secondary rounded-md border px-3 py-2 text-sm font-medium">
        Reset password
      </button>

      <Dialog open={open} onClose={close} title={`Reset password for ${name}`}>
        {state?.ok ? (
          <div className="flex flex-col gap-4">
            <FormNotice tone="success">Password reset. {name} has been signed out everywhere and must use this to sign in again.</FormNotice>
            <div className="bg-muted relative flex items-center justify-between gap-2 rounded-md px-3 py-2 font-mono text-sm break-all">
              {password}
              <CopyButton value={password} label="Copy password" className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-xs">Shown only this once. Ask them to change it from the Account page after signing in.</p>
            <div className="flex justify-end">
              <button type="button" onClick={close} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm">Type a temporary password or generate one. Saving signs {name} out of every session; they sign back in with this and should then change it.</p>
            <div className="flex flex-col gap-1">
              <label htmlFor="resetPassword" className="text-sm font-medium">
                New temporary password
              </label>
              <TemporaryPasswordField id="resetPassword" name="password" value={password} onChange={setPassword} error={fieldErrors?.password} />
              {!fieldErrors?.password && <p className="text-muted-foreground text-xs">At least {MIN_PASSWORD_LENGTH} characters.</p>}
            </div>
            {state && !state.ok && !fieldErrors && <p role="alert" className="text-destructive text-sm">{state.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={pending || password.length < MIN_PASSWORD_LENGTH} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                {pending ? "Saving…" : "Reset password"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
