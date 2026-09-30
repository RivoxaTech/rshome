import { PERMISSIONS } from "@/features/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";

/** The dashboard (C21): a welcome for now; the store's figures come in a later slice. */
export default async function DashboardPage() {
  const session = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl tracking-tight">Welcome, {session.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Your store at a glance will appear here. Orders are in the menu.</p>
      </div>
      <div className="border-border text-muted-foreground grid min-h-48 place-items-center rounded-xl border border-dashed text-sm">
        Statistics coming soon
      </div>
    </div>
  );
}
