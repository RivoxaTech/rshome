"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/panel/Dialog";
import { useStaffAction } from "@/components/panel/use-staff-action";
import type { PermissionKey } from "@/features/auth/permissions";
import { resetRoleDefaultsAction } from "@/app/panel/(protected)/roles/actions";

/**
 * "Reset to defaults" for a system role (S20): restores the code's default permission set after
 * a confirm dialog, in its own `<form>` outside the save form (D49). Shows exactly what will be
 * added and removed, and is audited as `role.reset_defaults`.
 */
export function ResetRoleDefaultsDialog({
  id,
  name,
  version,
  current,
  defaults,
  labels,
}: {
  id: number;
  name: string;
  version: string;
  current: PermissionKey[];
  defaults: PermissionKey[];
  labels: Record<PermissionKey, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { state, formAction, pending } = useStaffAction(resetRoleDefaultsAction, () => {
    setOpen(false);
    router.refresh();
  });
  const toAdd = defaults.filter((key) => !current.includes(key));
  const toRemove = current.filter((key) => !defaults.includes(key));
  const alreadyDefault = toAdd.length === 0 && toRemove.length === 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="border-input hover:bg-secondary rounded-md border px-3 py-2 text-sm font-medium">
        Reset to defaults
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Reset ${name} to its defaults`}>
        <div className="flex flex-col gap-4 text-sm">
          {alreadyDefault ? (
            <p>This role already holds exactly its code defaults. Nothing would change.</p>
          ) : (
            <>
              <p>This puts the role back to the permission set defined in code, signs its users out, and records the change in the audit log.</p>
              {toAdd.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Will be added</p>
                  <ul className="bg-muted flex flex-col gap-1 rounded-md p-3">
                    {toAdd.map((key) => (
                      <li key={key}>
                        {labels[key]} <span className="text-muted-foreground font-mono text-xs">{key}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {toRemove.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Will be removed</p>
                  <ul className="bg-muted flex flex-col gap-1 rounded-md p-3">
                    {toRemove.map((key) => (
                      <li key={key}>
                        {labels[key]} <span className="text-muted-foreground font-mono text-xs">{key}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {state && !state.ok && <p className="text-destructive text-sm">{state.error}</p>}
          <form action={formAction} className="flex justify-end gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={version} />
            <button type="button" onClick={() => setOpen(false)} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
              {alreadyDefault ? "Close" : "Cancel"}
            </button>
            {!alreadyDefault && (
              <button type="submit" disabled={pending} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                {pending ? "Resetting…" : "Reset to defaults"}
              </button>
            )}
          </form>
        </div>
      </Dialog>
    </>
  );
}
