import { requirePermission } from "@/server/auth/permissions";
import { PERMISSIONS } from "@/features/auth/permissions";

export default async function DashboardPage() {
  const session = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground text-sm">
        Welcome, {session.name} ({session.roleKey}).
      </p>
    </div>
  );
}
