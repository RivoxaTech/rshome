import Link from "next/link";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { PermissionMatrix } from "@/components/panel/roles/PermissionMatrix";
import { PERMISSIONS } from "@/features/auth/permissions";
import { PERMISSION_LABELS, listRoleColumns } from "@/features/roles/staff-service";
import { requirePermission } from "@/server/auth/permissions";

/** The roles page (S20, `role.manage`): the permissions matrix — every key by every role, each column saved on its own. */
export async function RolesPageBody() {
  await requirePermission(PERMISSIONS.ROLE_MANAGE);
  const roles = await listRoleColumns();

  return (
    <>
      <PanelPageTitle title="Roles" />
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            Switch any permission on or off for any role, then save that role&apos;s column. Saving signs that role&apos;s users out so the change applies from their next sign-in. A
            role&apos;s name, key and deletion are on its own page.
          </p>
          <Link href="/panel/roles/new" className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap">
            New role
          </Link>
        </div>
        {/* Remounts whenever any role is saved (new version tokens), so unsaved switch state never survives a stale save. */}
        <PermissionMatrix key={roles.map((role) => role.version).join("|")} roles={roles} labels={PERMISSION_LABELS} />
      </div>
    </>
  );
}
