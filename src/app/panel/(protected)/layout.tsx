import { PanelFrame } from "@/components/panel/PanelFrame";
import { siteConfig } from "@/config/site.config";
import { getOrderCountsForPermissions } from "@/features/orders/staff-service";
import { getWholesaleCountsForPermissions } from "@/features/wholesale/staff-service";
import { requireSession } from "@/server/auth/permissions";

export default async function ProtectedPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [orderCounts, wholesaleCounts] = await Promise.all([
    getOrderCountsForPermissions(session.permissions),
    getWholesaleCountsForPermissions(session.permissions),
  ]);
  const counts = { ...orderCounts, ...wholesaleCounts };

  return (
    <PanelFrame permissions={session.permissions} counts={counts} logoText={siteConfig.logoText} userName={session.name} roleLabel={session.roleKey}>
      {children}
    </PanelFrame>
  );
}
