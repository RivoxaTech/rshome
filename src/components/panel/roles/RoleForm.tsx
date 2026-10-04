"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FormNotice, inputClass } from "@/components/panel/FormField";
import { Switch } from "@/components/panel/Switch";
import { SensitiveGrantDialog } from "@/components/panel/roles/SensitiveGrantDialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { ACCESS_CONTROL_PERMISSIONS, PERMISSION_GROUPS } from "@/features/auth/permission-groups";
import { sensitiveGrants, type PermissionKey } from "@/features/auth/permissions";
import { suggestRoleKey } from "@/features/roles/schemas";
import type { StaffActionResult } from "@/features/roles/staff-service";

type RoleFormValues = {
  id: number | null;
  key: string;
  name: string;
  permissions: PermissionKey[];
};

/**
 * Create/edit a role (S20): one `<form>` posting the chosen keys as one comma-separated
 * `permissions` field. Every permission is a Switch grouped by area with its description; any
 * key may be toggled on any role, system roles included (owner decision amending C24). A save
 * that newly grants a sensitive key (`sensitiveGrants`) opens the warning dialog first and only
 * submits with `confirmSensitive` once confirmed — the server refuses it otherwise. The edit
 * page's reset/delete dialogs come in through `actionsSlot`, rendered *outside* this form (D49).
 */
export function RoleForm({
  mode,
  initial,
  labels,
  version,
  memberCount,
  action,
  backHref,
  actionsSlot,
}: {
  mode: "create" | "edit";
  initial: RoleFormValues;
  labels: Record<PermissionKey, string>;
  version?: string;
  memberCount: number;
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  backHref: string;
  actionsSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { state, formAction, pending } = useStaffAction(action, () => {});
  const [name, setName] = useState(initial.name);
  const [keyTouched, setKeyTouched] = useState(mode === "edit" || initial.key !== "");
  const [key, setKey] = useState(initial.key);
  const [chosen, setChosen] = useState<Set<PermissionKey>>(new Set(initial.permissions));
  const [confirmed, setConfirmed] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<PermissionKey[]>([]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;
  const managesAccess = ACCESS_CONTROL_PERMISSIONS.some((permission) => chosen.has(permission));
  const next = [...chosen];
  const sensitive = mode === "edit" ? sensitiveGrants(initial.key, initial.permissions, next) : [];

  function toggle(permission: PermissionKey, on: boolean) {
    setChosen((current) => {
      const updated = new Set(current);
      if (on) updated.add(permission);
      else updated.delete(permission);
      return updated;
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (sensitive.length > 0 && !confirmed) {
      event.preventDefault();
      setPendingKeys(sensitive);
    }
  }

  function confirm() {
    setPendingKeys([]);
    setConfirmed(true);
    setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form ref={formRef} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "edit" && <input type="hidden" name="id" value={initial.id ?? ""} />}
        {mode === "edit" && version && <input type="hidden" name="version" value={version} />}
        <input type="hidden" name="permissions" value={next.join(",")} />
        <input type="hidden" name="confirmSensitive" value={confirmed ? "true" : "false"} />

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="name" label="Role name" error={fieldErrors?.name}>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!keyTouched) setKey(suggestRoleKey(event.target.value));
                }}
                required
                minLength={2}
                maxLength={100}
                className={`${inputClass} w-full`}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field id="key" label="Key" error={fieldErrors?.key} hint={mode === "create" ? "A short identifier, lowercase letters, numbers and dashes. Fixed after creation." : "Fixed after creation."}>
              {mode === "create" ? (
                <input
                  id="key"
                  name="key"
                  value={key}
                  onChange={(event) => {
                    setKeyTouched(true);
                    setKey(event.target.value);
                  }}
                  required
                  minLength={2}
                  maxLength={50}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  autoCapitalize="off"
                  autoComplete="off"
                  className={`${inputClass} w-full font-mono`}
                />
              ) : (
                <input id="key" value={initial.key} readOnly className={`${inputClass} w-full font-mono opacity-70`} />
              )}
            </Field>
          </div>
        </div>

        {managesAccess && (
          <div className="border-amber-500/40 bg-amber-500/10 rounded-md border p-3 text-sm" role="status">
            This role can manage users or roles, so anyone holding it can change who has access to the panel. Give it only to people you trust with that.
          </div>
        )}
        {fieldErrors?.permissions && <p className="text-destructive text-sm">{fieldErrors.permissions}</p>}
        {fieldErrors?.confirmSensitive && <p className="text-destructive text-sm">{fieldErrors.confirmSensitive}</p>}

        {/* Plain sections with visible headings, never an `sr-only` legend: an absolutely-positioned sr-only element
            inside the panel's scrolling <main> grows the document (ARCHITECTURE.md D47, re-found by the scroll probe). */}
        {PERMISSION_GROUPS.map((group) => (
          <section key={group.key} aria-labelledby={`group-${group.key}`} className="bg-card border-border flex flex-col gap-3 rounded-lg border p-4">
            <h2 id={`group-${group.key}`} className="text-sm font-semibold">
              {group.label}
            </h2>
            <ul className="divide-border flex flex-col divide-y">
              {group.permissions.map((permission) => (
                <li key={permission} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{labels[permission]}</p>
                    <p className="text-muted-foreground font-mono text-xs">{permission}</p>
                  </div>
                  {/* No form-relevant `name`: the chosen keys are posted once, through the hidden field above. */}
                  <Switch name={`switch-${permission}`} checked={chosen.has(permission)} onChange={(on) => toggle(permission, on)} />
                </li>
              ))}
            </ul>
          </section>
        ))}

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

        {mode === "edit" && memberCount > 0 && (
          <p className="text-muted-foreground text-xs">
            Saving signs out the {memberCount} {memberCount === 1 ? "user who holds" : "users who hold"} this role, so the new permissions apply from their next sign-in.
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={pending} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {pending ? "Saving…" : mode === "create" ? "Create role" : "Save changes"}
          </button>
          <button type="button" onClick={() => router.push(backHref)} className="border-input hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium">
            Cancel
          </button>
        </div>
      </form>

      <SensitiveGrantDialog roleName={initial.name} roleKey={initial.key} keys={pendingKeys} labels={labels} onConfirm={confirm} onClose={() => setPendingKeys([])} />

      {actionsSlot && <div className="border-border border-t pt-4">{actionsSlot}</div>}
    </div>
  );
}
