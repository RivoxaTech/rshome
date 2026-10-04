"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, FormNotice, inputClass } from "@/components/panel/FormField";
import { Listbox } from "@/components/panel/Listbox";
import { Switch } from "@/components/panel/Switch";
import { TemporaryPasswordField } from "@/components/panel/users/TemporaryPasswordField";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { CopyButton } from "@/components/ui/CopyButton";
import { MIN_PASSWORD_LENGTH } from "@/features/users/schemas";
import type { RoleOption, StaffActionResult } from "@/features/users/staff-service";

type UserFormValues = {
  id: number | null;
  name: string;
  email: string;
  roleId: string;
  isActive: boolean;
};

/**
 * Create/edit a user (S20): one `<form>`; the edit page's quick action, reset-password and delete
 * dialogs come in through `actionsSlot`, rendered *outside* this form (D49). On create the
 * temporary password is kept in the browser and shown once after the save succeeds — the server
 * hashes it and never sends it back. `version` is the row's concurrency token (edit only).
 * `isSelf` pins the role and the Active switch, since the server refuses both changes on one's
 * own account anyway.
 */
type UserFormProps = {
  mode: "create" | "edit";
  initial: UserFormValues;
  roles: RoleOption[];
  version?: string;
  isSelf: boolean;
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  backHref: string;
  actionsSlot?: React.ReactNode;
};

export function UserForm(props: UserFormProps) {
  // "Add another" after a create remounts the body, which is the only way to clear `useActionState`'s result.
  const [instance, setInstance] = useState(0);
  return <UserFormBody key={instance} {...props} onReset={() => setInstance((current) => current + 1)} />;
}

function UserFormBody({ mode, initial, roles, version, isSelf, action, backHref, actionsSlot, onReset }: UserFormProps & { onReset: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(initial.email);
  // On create, success keeps the page (the password must be shown once); the update action redirects on its own.
  const { state, formAction, pending } = useStaffAction(action, () => {});
  const [roleId, setRoleId] = useState(initial.roleId);
  const [isActive, setIsActive] = useState(initial.isActive);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;
  const roleItems = roles.map((role) => ({ value: String(role.id), label: role.isSystem ? `${role.name} (system)` : role.name }));

  if (mode === "create" && state?.ok) {
    return (
      <div className="bg-card border-border flex max-w-xl flex-col gap-4 rounded-lg border p-4">
        <FormNotice tone="success">User created. Share these sign-in details now — the password is shown only this once and is never stored in plain text.</FormNotice>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="relative flex items-center gap-1 break-all">
            {email.trim().toLowerCase()}
            <CopyButton value={email.trim().toLowerCase()} label="Copy email" className="text-muted-foreground" />
          </dd>
          <dt className="text-muted-foreground">Temporary password</dt>
          <dd className="relative flex items-center gap-1 font-mono break-all">
            {password}
            <CopyButton value={password} label="Copy password" className="text-muted-foreground" />
          </dd>
        </dl>
        <p className="text-muted-foreground text-xs">Ask them to change it from the Account page after their first sign-in.</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link href={backHref} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium">
            Back to users
          </Link>
          <button type="button" onClick={onReset} className="border-input hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium">
            Add another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {mode === "edit" && <input type="hidden" name="id" value={initial.id ?? ""} />}
        {mode === "edit" && version && <input type="hidden" name="version" value={version} />}

        <Field id="name" label="Name" error={fieldErrors?.name}>
          <input id="name" name="name" defaultValue={initial.name} required minLength={2} maxLength={150} autoComplete="off" className={`${inputClass} w-full`} />
        </Field>

        <Field id="email" label="Email" error={fieldErrors?.email} hint="Used to sign in. Saved in lowercase; must be unique.">
          <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={191} autoComplete="off" className={`${inputClass} w-full`} />
        </Field>

        <Field id="roleId" label="Role" error={fieldErrors?.roleId} hint={isSelf ? "You can't change your own role." : "Decides which pages and actions this person gets. Changing it signs them out everywhere."}>
          <Listbox id="roleId" name="roleId" value={roleId} onChange={setRoleId} ariaLabel="Role" items={roleItems} placeholder="Choose a role" disabled={isSelf} />
        </Field>

        {mode === "create" && (
          <Field id="password" label="Temporary password" error={fieldErrors?.password} hint={`At least ${MIN_PASSWORD_LENGTH} characters. Type one or generate it; it's shown once after saving.`}>
            <TemporaryPasswordField id="password" name="password" value={password} onChange={setPassword} error={undefined} />
          </Field>
        )}

        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-sm font-medium">Active</span>
            <p className="text-muted-foreground text-xs">{isSelf ? "You can't deactivate your own account." : "Off blocks sign-in and ends every open session at once."}</p>
            {fieldErrors?.isActive && <p role="alert" className="text-destructive text-xs">{fieldErrors.isActive}</p>}
          </div>
          {isSelf ? <input type="hidden" name="isActive" value={isActive ? "true" : "false"} /> : <Switch name="isActive" checked={isActive} onChange={setIsActive} />}
        </div>

        {formError && (
          <FormNotice tone="error">
            {formError}{" "}
            {formError.includes("Reload") && (
              <button type="button" onClick={() => window.location.reload()} className="font-medium underline underline-offset-2">
                Reload
              </button>
            )}
          </FormNotice>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={pending} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {pending ? "Saving…" : mode === "create" ? "Create user" : "Save changes"}
          </button>
          <button type="button" onClick={() => router.push(backHref)} className="border-input hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium">
            Cancel
          </button>
        </div>
      </form>

      {/* Outside the form above: the quick action's and the dialogs' own `<form>`s must never nest inside it (D49). */}
      {actionsSlot && <div className="border-border border-t pt-4">{actionsSlot}</div>}
    </div>
  );
}
