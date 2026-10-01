import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { getPanelTheme, getSidebarCollapsed } from "@/app/panel/panel-prefs";
import { PanelUiProvider } from "@/components/panel/PanelUiContext";
import { PanelSidebar } from "@/components/panel/PanelSidebar";
import { PanelHeader } from "@/components/panel/PanelHeader";
import { OrderCountsPoller } from "@/components/panel/notifications/OrderCountsPoller";
import { PANEL_NAV_ITEMS } from "@/components/panel/nav-items";
import { env } from "@/server/env";

/**
 * The signed-in panel's frame (S9): a fixed-height sidebar and header around a single scrolling
 * content area — the outer page and the sidebar never scroll, only `<main>` does.
 */
export async function PanelFrame({
  permissions,
  counts = {},
  logoText,
  userName,
  roleLabel,
  children,
}: {
  permissions: ReadonlySet<PermissionKey>;
  counts?: Partial<Record<string, number>>;
  logoText: string;
  userName: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  const [theme, collapsed] = await Promise.all([getPanelTheme(), getSidebarCollapsed()]);
  const items = PANEL_NAV_ITEMS.filter((item) => permissions.has(item.permission));
  // The bell and the live count are for `order.view` holders only (ARCHITECTURE.md §9) — the
  // Developer never sees either, since they never hold that permission (BUILD_PLAN.md C24).
  const canSeeOrderAlerts = permissions.has(PERMISSIONS.ORDER_VIEW);

  return (
    <PanelUiProvider initialTheme={theme} initialCollapsed={collapsed} initialCounts={counts}>
      {canSeeOrderAlerts && <OrderCountsPoller />}
      <div className="flex h-dvh w-full overflow-hidden">
        <PanelSidebar items={items} logoText={logoText} userName={userName} roleLabel={roleLabel} />
        <div className="flex min-w-0 flex-1 flex-col">
          <PanelHeader showNotifications={canSeeOrderAlerts} vapidPublicKey={env.VAPID_PUBLIC_KEY ?? null} />
          <main className="bg-background flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>
    </PanelUiProvider>
  );
}
