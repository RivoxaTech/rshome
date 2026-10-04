import type { Metadata } from "next";
import { PanelFrame } from "@/components/panel/PanelFrame";
import { getOrderCountsForPermissions } from "@/features/orders/staff-service";
import { getStoreIdentity } from "@/features/settings/service";
import { getWholesaleCountsForPermissions } from "@/features/wholesale/staff-service";
import { requireSession } from "@/server/auth/permissions";

/** The tab title is the store name from `settings` (D56), like the storefront's (S22 BUG-28). */
export async function generateMetadata(): Promise<Metadata> {
  const identity = await getStoreIdentity();
  return { title: { default: identity.storeName, template: `%s | ${identity.storeName}` } };
}

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
