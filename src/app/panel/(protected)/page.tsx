import { requirePermission } from "@/server/auth/permissions";
import { PERMISSIONS } from "@/features/auth/permissions";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";

export default async function DashboardPage() {
  const session = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

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
