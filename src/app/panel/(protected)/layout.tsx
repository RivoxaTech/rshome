import { PanelFrame } from "@/components/panel/PanelFrame";
import { siteConfig } from "@/config/site.config";
import { getOrderCountsForPermissions } from "@/features/orders/staff-service";
import { requireSession } from "@/server/auth/permissions";

export default async function ProtectedPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const counts = await getOrderCountsForPermissions(session.permissions);

  return (
    <PanelFrame permissions={session.permissions} counts={counts} logoText={siteConfig.logoText} userName={session.name} roleLabel={session.roleKey}>
      {children}
    </PanelFrame>
  );
}
