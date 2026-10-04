import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/panel/account/ChangePasswordForm";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { requireSession } from "@/server/auth/permissions";

export const metadata: Metadata = { title: "Account" };

/** Open to any signed-in user (BUILD_PLAN.md C25) — no `requirePermission` call. */
export default async function AccountPage() {
  const session = await requireSession();

  return (
    <>
      <PanelPageTitle title="Account" />
      <div className="bg-card border-border max-w-md rounded-lg border p-6">
        <p className="text-sm">
          Signed in as <span className="font-medium">{session.name}</span>{" "}
          <span className="text-muted-foreground">({session.roleKey})</span>
        </p>
        <div className="border-border mt-4 border-t pt-4">
          <h2 className="text-sm font-semibold">Change password</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Changing your password signs you out everywhere else, on every other device.
          </p>
          <ChangePasswordForm />
        </div>
      </div>
    </>
  );
}
