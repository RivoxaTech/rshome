import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/features/auth/landing";
import { PERMISSIONS } from "@/features/auth/permissions";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";

/**
 * The Developer no longer holds `dashboard.view` (BUILD_PLAN.md C24), so this is never their
 * landing page — redirect to their own first-allowed page instead of the generic 403 (S9b).
 */
export default async function DashboardPage() {
  const session = await requireSession();
  if (!session.permissions.has(PERMISSIONS.DASHBOARD_VIEW)) redirect(firstAllowedPath(session.permissions));

  return (
    <>
      <PanelPageTitle title="Dashboard" />
      <div className="bg-card border-border rounded-lg border p-6">
        <p className="text-sm">
          Welcome, {session.name} <span className="text-muted-foreground">({session.roleKey})</span>.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">Revenue and order statistics arrive in a later slice.</p>
      </div>
    </>
  );
}
