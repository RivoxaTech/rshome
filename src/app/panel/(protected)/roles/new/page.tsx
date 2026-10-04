import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { RoleForm } from "@/components/panel/roles/RoleForm";
import { PERMISSIONS } from "@/features/auth/permissions";
import { PERMISSION_LABELS } from "@/features/roles/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { createRoleAction } from "@/app/panel/(protected)/roles/actions";

export default async function NewRolePage() {
  await requirePermission(PERMISSIONS.ROLE_MANAGE);

  return (
    <>
      <PanelPageTitle title="New role" />
      <PanelFormHeader title="New role" backHref="/panel/roles" backLabel="Back to roles" />
      <RoleForm mode="create" action={createRoleAction} backHref="/panel/roles" labels={PERMISSION_LABELS} memberCount={0} initial={{ id: null, key: "", name: "", permissions: [] }} />
    </>
  );
}
