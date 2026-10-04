import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { StatusPill } from "@/components/panel/StatusPill";
import { DeleteUserDialog } from "@/components/panel/users/DeleteUserDialog";
import { ResetPasswordDialog } from "@/components/panel/users/ResetPasswordDialog";
import { UserForm } from "@/components/panel/users/UserForm";
import { UserActiveToggle } from "@/components/panel/users/UserRowActions";
import { USER_ACTIVE_COLORS, USER_INACTIVE_COLORS } from "@/components/panel/users/user-colors";
import { PERMISSIONS } from "@/features/auth/permissions";
import { userBackHrefSchema } from "@/features/users/schemas";
import { getRoleOptions, getUserForEdit } from "@/features/users/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { updateUserAction } from "@/app/panel/(protected)/users/actions";

export const metadata: Metadata = { title: "Edit user" };

export default async function EditUserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) notFound();

  const { back } = await searchParams;
  const backHref = userBackHrefSchema.parse(back) ?? "/panel/users";

  const [formData, roles] = await Promise.all([getUserForEdit(userId), getRoleOptions()]);
  if (!formData) notFound();
  const { user, version, lastLoginAt, createdAt, deleteGuard } = formData;
  const isSelf = user.id === session.id;

  return (
    <>
      <PanelPageTitle title={user.name} />
      <PanelFormHeader title={user.name} backHref={backHref} backLabel="Back to users">
        <StatusPill label={user.isActive ? "Active" : "Inactive"} colors={user.isActive ? USER_ACTIVE_COLORS : USER_INACTIVE_COLORS} />
        {isSelf && <span className="text-muted-foreground text-xs">This is your account</span>}
      </PanelFormHeader>
      <p className="text-muted-foreground -mt-1 text-xs">
        Last login {lastLoginAt ?? "never"} · Created {createdAt}
      </p>
      <UserForm
        // Remounts fresh when the row changes underneath it (the quick action and the reset dialog save without navigating away).
        key={version}
        mode="edit"
        action={updateUserAction}
        backHref={backHref}
        roles={roles}
        version={version}
        isSelf={isSelf}
        initial={{ id: user.id, name: user.name, email: user.email, roleId: String(user.roleId), isActive: user.isActive }}
        actionsSlot={
          <div className="flex flex-wrap items-center gap-2">
            {!isSelf && <UserActiveToggle id={user.id} isActive={user.isActive} variant="button" />}
            <ResetPasswordDialog id={user.id} name={user.name} />
            {!isSelf && <DeleteUserDialog id={user.id} name={user.name} isActive={user.isActive} guard={deleteGuard} />}
          </div>
        }
      />
    </>
  );
}
