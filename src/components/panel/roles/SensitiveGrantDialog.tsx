"use client";

import { Dialog } from "@/components/panel/Dialog";
import type { PermissionKey } from "@/features/auth/permissions";

/**
 * The plain warning shown before a sensitive grant is saved (S20 owner decision): a customer-data
 * key for the Developer role, a configuration key for the Admin role. Buttons only — no `<form>` of
 * its own, so it can sit next to any save form without nesting (D49); the caller sets the
 * `confirmSensitive` flag and submits its own form on confirm. The server refuses the save without
 * that flag regardless.
 */
export function SensitiveGrantDialog({
  roleName,
  roleKey,
  keys,
  labels,
  onConfirm,
  onClose,
}: {
  roleName: string;
  roleKey: string;
  keys: PermissionKey[];
  labels: Record<PermissionKey, string>;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const side = roleKey === "developer" ? "see customer data: orders, payment screenshots, wholesale leads, revenue or bank details" : "change the store's configuration or who has access";

  return (
    <Dialog open={keys.length > 0} onClose={onClose} title={`Give ${roleName} more access?`}>
      <div className="flex flex-col gap-4 text-sm">
        <p>
          This lets everyone holding the <span className="font-medium">{roleName}</span> role {side}:
        </p>
        <ul className="bg-muted flex flex-col gap-1 rounded-md p-3">
          {keys.map((key) => (
            <li key={key}>
              <span className="font-medium">{labels[key]}</span> <span className="text-muted-foreground font-mono text-xs">{key}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">The change is recorded in the audit log with this list. You can take it back any time from the same page.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="border-input hover:bg-secondary rounded-md border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium">
            Yes, give this access
          </button>
        </div>
      </div>
    </Dialog>
  );
}
