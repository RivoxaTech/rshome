import { PanelPage } from "@/components/panel/PanelPage";
import { PERMISSIONS } from "@/features/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";

/** The dashboard (C21): a welcome for now; the store's figures come in a later slice. */
export default async function DashboardPage() {
  const session = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  return (
    <PanelPage crumbs={[{ label: "Dashboard" }]}>
      <div className="grid gap-4">
        <div>
          <h2 className="text-xl tracking-tight">Welcome, {session.name}</h2>
          <p className="text-muted-foreground mt-1 text-[13px]">Your store at a glance will appear here. Orders are in the menu.</p>
        </div>
        <div className="border-border text-muted-foreground grid min-h-40 place-items-center rounded-lg border border-dashed text-[13px]">
          Statistics coming soon
        </div>
      </div>
    </PanelPage>
  );
}
