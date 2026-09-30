import { PanelFrame } from "@/components/panel/PanelFrame";
import { siteConfig } from "@/config/site.config";
import { PERMISSIONS } from "@/features/auth/permissions";
import { getOrderCounts } from "@/features/orders/staff-service";
import { requireSession } from "@/server/auth/permissions";

export default async function ProtectedPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const counts: Partial<Record<string, number>> = {};
  if (session.permissions.has(PERMISSIONS.ORDER_VIEW)) {
    const orderCounts = await getOrderCounts();
    counts["orders-bank"] = orderCounts.bank_transfer.needsAction;
    counts["orders-cod"] = orderCounts.cod.needsAction;
  }

  return (
    <PanelFrame permissions={session.permissions} counts={counts} logoText={siteConfig.logoText} userName={session.name} roleLabel={session.roleKey}>
      {children}
    </PanelFrame>
  );
}
