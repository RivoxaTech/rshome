import { notFound } from "next/navigation";
import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { StatusPill } from "@/components/panel/StatusPill";
import { DeleteRoleDialog } from "@/components/panel/roles/DeleteRoleDialog";
import { ResetRoleDefaultsDialog } from "@/components/panel/roles/ResetRoleDefaultsDialog";
import { RoleForm } from "@/components/panel/roles/RoleForm";
import { ROLE_CUSTOM_COLORS, ROLE_SYSTEM_COLORS } from "@/components/panel/roles/role-colors";
import { PERMISSIONS } from "@/features/auth/permissions";
import { PERMISSION_LABELS, checkRoleDeletable, getRoleForEdit } from "@/features/roles/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { updateRoleAction } from "@/app/panel/(protected)/roles/actions";

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.ROLE_MANAGE);
  const { id } = await params;
  const roleId = Number(id);
  if (!Number.isInteger(roleId) || roleId <= 0) notFound();

  const [formData, deleteGuard] = await Promise.all([getRoleForEdit(roleId), checkRoleDeletable(roleId)]);
  if (!formData) notFound();
  const { role, permissions, version, memberCount, defaults } = formData;

  return (
    <>
      <PanelPageTitle title={role.name} />
      <PanelFormHeader title={role.name} backHref="/panel/roles" backLabel="Back to roles">
        <StatusPill label={role.isSystem ? "System" : "Custom"} colors={role.isSystem ? ROLE_SYSTEM_COLORS : ROLE_CUSTOM_COLORS} />
        <span className="text-muted-foreground text-xs">
          {memberCount} {memberCount === 1 ? "user" : "users"}
        </span>
      </PanelFormHeader>
      {role.isSystem && (
        <p className="text-muted-foreground -mt-1 text-xs">
          A system role: created by the seed with the code defaults, editable here since. The seed never changes it again; &ldquo;Reset to defaults&rdquo; restores the code set.
        </p>
      )}
      <RoleForm
        key={version}
        mode="edit"
        action={updateRoleAction}
        backHref="/panel/roles"
        labels={PERMISSION_LABELS}
        version={version}
        memberCount={memberCount}
        initial={{ id: role.id, key: role.key, name: role.name, permissions }}
        actionsSlot={
          <div className="flex flex-wrap items-center gap-2">
            {defaults && <ResetRoleDefaultsDialog id={role.id} name={role.name} version={version} current={permissions} defaults={defaults} labels={PERMISSION_LABELS} />}
            {!role.isSystem && <DeleteRoleDialog id={role.id} name={role.name} guard={deleteGuard} />}
          </div>
        }
      />
    </>
  );
}
