import { PanelFrame, type PanelNavItem } from "@/components/panel/PanelFrame";
import { siteConfig } from "@/config/site.config";
import { PERMISSIONS } from "@/features/auth/permissions";
import { getOrderCounts } from "@/features/orders/staff-service";
import { METHOD_PAGES, ordersPath } from "@/features/orders/transitions";
import { requireSession } from "@/server/auth/permissions";
import { readPanelTheme } from "../panel-theme";

/**
 * The signed-in panel (C21). The menu is built from permissions, never role names: Dashboard and
 * the two orders pages, each with the number of orders needing staff (new orders to review and
 * delivery charge screenshots to check).
 */
export default async function ProtectedPanelLayout({ children }: LayoutProps<"/panel">) {
  const session = await requireSession();
  const counts = session.permissions.has(PERMISSIONS.ORDER_VIEW) ? await getOrderCounts() : null;

  const nav: PanelNavItem[] = [];
  if (session.permissions.has(PERMISSIONS.DASHBOARD_VIEW)) nav.push({ label: "Dashboard", href: "/panel", icon: "dashboard", badge: 0 });
  if (counts) {
    nav.push(
      { label: METHOD_PAGES.bank_transfer.navLabel, href: ordersPath("bank_transfer"), icon: "bank", badge: counts.bank_transfer.needsAction },
      { label: METHOD_PAGES.cod.navLabel, href: ordersPath("cod"), icon: "cash", badge: counts.cod.needsAction },
    );
  }

  return (
    <PanelFrame nav={nav} userName={session.name} logoText={siteConfig.logoText} theme={await readPanelTheme()}>
      {children}
    </PanelFrame>
  );
}
