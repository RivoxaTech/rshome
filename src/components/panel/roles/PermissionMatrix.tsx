"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/panel/StatusPill";
import { Switch } from "@/components/panel/Switch";
import { SensitiveGrantDialog } from "@/components/panel/roles/SensitiveGrantDialog";
import { ROLE_CUSTOM_COLORS, ROLE_SYSTEM_COLORS, ROLE_WARNING_COLORS } from "@/components/panel/roles/role-colors";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { PERMISSION_GROUPS } from "@/features/auth/permission-groups";
import { sensitiveGrants, type PermissionKey } from "@/features/auth/permissions";
import type { StaffRoleColumn } from "@/features/roles/staff-service";
import { saveRolePermissionsAction } from "@/app/panel/(protected)/roles/actions";

const sameSet = (a: readonly PermissionKey[], b: ReadonlySet<PermissionKey>) => a.length === b.size && a.every((key) => b.has(key));

/**
 * One role's column header: its name, pills, member count, an Edit link, and the column's own
 * Save `<form>` (hidden inputs only — the switches in the cells below are outside every form, so
 * nothing nests, D49). A save that newly grants a sensitive key opens the warning dialog first and
 * only submits with `confirmSensitive` once confirmed.
 */
function RoleColumnHeader({ role, chosen, labels }: { role: StaffRoleColumn; chosen: Set<PermissionKey>; labels: Record<PermissionKey, string> }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<PermissionKey[]>([]);
  const { state, formAction, pending } = useStaffAction(saveRolePermissionsAction, () => router.refresh());
  const dirty = !sameSet(role.permissions, chosen);
  const next = [...chosen];
  const sensitive = sensitiveGrants(role.key, role.permissions, next);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (sensitive.length > 0 && !confirmed) {
      event.preventDefault();
      setPendingKeys(sensitive);
    }
  }

  function confirm() {
    setPendingKeys([]);
    setConfirmed(true);
    // The flag is a controlled hidden input: submit after React has flushed it.
    setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  return (
    <div className="flex min-w-[9.5rem] flex-col gap-1.5">
      <div className="flex flex-col gap-1">
        <Link href={`/panel/roles/${role.id}`} className="text-primary text-sm font-semibold hover:underline">
          {role.name}
        </Link>
        <span className="text-muted-foreground font-mono text-[11px] font-normal">{role.key}</span>
        <div className="flex flex-wrap gap-1">
          <StatusPill label={role.isSystem ? "System" : "Custom"} colors={role.isSystem ? ROLE_SYSTEM_COLORS : ROLE_CUSTOM_COLORS} />
          {role.managesAccess && <StatusPill label="Manages access" colors={ROLE_WARNING_COLORS} />}
        </div>
        <span className="text-muted-foreground text-xs font-normal">
          {role.memberCount} {role.memberCount === 1 ? "user" : "users"}
        </span>
      </div>
      <form ref={formRef} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-1">
        <input type="hidden" name="id" value={role.id} />
        <input type="hidden" name="version" value={role.version} />
        <input type="hidden" name="permissions" value={next.join(",")} />
        <input type="hidden" name="confirmSensitive" value={confirmed ? "true" : "false"} />
        <button
          type="submit"
          disabled={!dirty || pending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {pending ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
        {state && !state.ok && <span className="text-destructive text-xs font-normal whitespace-normal">{state.error}</span>}
      </form>
      <SensitiveGrantDialog roleName={role.name} roleKey={role.key} keys={pendingKeys} labels={labels} onConfirm={confirm} onClose={() => setPendingKeys([])} />
    </div>
  );
}

/**
 * The permissions matrix (S20 owner decision): rows are every permission key grouped as
 * `PERMISSION_GROUPS` with its description, columns are every role, each cell a Switch, each
 * column its own Save with stale-edit protection. The table scrolls inside its own container
 * (sticky first column), so a phone never gets a sideways page scroll. Remounted by the page on
 * every change of any role's version, so the switches always start from what's saved.
 */
export function PermissionMatrix({ roles, labels }: { roles: StaffRoleColumn[]; labels: Record<PermissionKey, string> }) {
  const [chosen, setChosen] = useState<Record<number, Set<PermissionKey>>>(() => Object.fromEntries(roles.map((role) => [role.id, new Set(role.permissions)])));

  function toggle(roleId: number, key: PermissionKey, on: boolean) {
    setChosen((current) => {
      const set = new Set(current[roleId]);
      if (on) set.add(key);
      else set.delete(key);
      return { ...current, [roleId]: set };
    });
  }

  return (
    <div className="bg-card border-border rounded-lg border">
      <div className="thin-scrollbar overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="align-top">
              <th scope="col" className="bg-card border-border sticky left-0 z-10 min-w-[12rem] border-r border-b px-3 py-3 text-xs font-medium sm:min-w-[16rem]">
                <span className="text-muted-foreground">Permission</span>
              </th>
              {roles.map((role) => (
                <th key={role.id} scope="col" className="border-border border-b px-3 py-3 align-top">
                  <RoleColumnHeader role={role} chosen={chosen[role.id] ?? new Set()} labels={labels} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <GroupRows key={group.key} group={group} roles={roles} chosen={chosen} labels={labels} onToggle={toggle} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  roles,
  chosen,
  labels,
  onToggle,
}: {
  group: (typeof PERMISSION_GROUPS)[number];
  roles: StaffRoleColumn[];
  chosen: Record<number, Set<PermissionKey>>;
  labels: Record<PermissionKey, string>;
  onToggle: (roleId: number, key: PermissionKey, on: boolean) => void;
}) {
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={roles.length + 1} className="bg-muted/60 text-muted-foreground sticky left-0 px-3 py-1.5 text-left text-xs font-medium tracking-wide uppercase">
          {group.label}
        </th>
      </tr>
      {group.permissions.map((key) => (
        <tr key={key} className="border-border">
          <th scope="row" className="bg-card border-border sticky left-0 z-10 border-r border-b px-3 py-2 text-left font-normal">
            <span className="block text-sm">{labels[key]}</span>
            <span className="text-muted-foreground block font-mono text-[11px]">{key}</span>
          </th>
          {roles.map((role) => {
            const on = chosen[role.id]?.has(key) ?? false;
            const changed = on !== role.permissions.includes(key);
            return (
              <td key={role.id} className={`border-border border-b px-3 py-2 ${changed ? "bg-amber-500/10" : ""}`}>
                <span className="inline-flex items-center gap-2" title={`${labels[key]} — ${role.name}`}>
                  {/* No form around these: the chosen set is posted once by the column's own hidden field. */}
                  <Switch name={`cell-${role.id}-${key}`} checked={on} onChange={(next) => onToggle(role.id, key, next)} />
                  {changed && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="unsaved change" />}
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
