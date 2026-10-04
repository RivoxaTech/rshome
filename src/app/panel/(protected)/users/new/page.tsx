import type { Metadata } from "next";
import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { UserForm } from "@/components/panel/users/UserForm";
import { PERMISSIONS } from "@/features/auth/permissions";
import { userBackHrefSchema } from "@/features/users/schemas";
import { getRoleOptions } from "@/features/users/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { createUserAction } from "@/app/panel/(protected)/users/actions";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  await requirePermission(PERMISSIONS.USER_MANAGE);
  const { back } = await searchParams;
  const backHref = userBackHrefSchema.parse(back) ?? "/panel/users";
  const roles = await getRoleOptions();

  return (
    <>
      <PanelPageTitle title="New user" />
      <PanelFormHeader title="New user" backHref={backHref} backLabel="Back to users" />
      <UserForm mode="create" action={createUserAction} backHref={backHref} roles={roles} isSelf={false} initial={{ id: null, name: "", email: "", roleId: "", isActive: true }} />
    </>
  );
}
