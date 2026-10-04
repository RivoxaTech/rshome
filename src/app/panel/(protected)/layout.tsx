import { PanelFrame } from "@/components/panel/PanelFrame";
import { getOrderCountsForPermissions } from "@/features/orders/staff-service";
import { getStoreIdentity } from "@/features/settings/service";
import { getWholesaleCountsForPermissions } from "@/features/wholesale/staff-service";
import { requireSession } from "@/server/auth/permissions";

export default async function ProtectedPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [orderCounts, wholesaleCounts, identity] = await Promise.all([
    getOrderCountsForPermissions(session.permissions),
    getWholesaleCountsForPermissions(session.permissions),
    getStoreIdentity(),
  ]);
  const counts = { ...orderCounts, ...wholesaleCounts };

  return (
    <PanelFrame permissions={session.permissions} counts={counts} logoText={identity.logoText} userName={session.name} roleLabel={session.roleKey}>
      {children}
    </PanelFrame>
  );
}
