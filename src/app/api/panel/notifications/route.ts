import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { getOrderCountsForPermissions } from "@/features/orders/staff-service";
import { getWholesaleCountsForPermissions } from "@/features/wholesale/staff-service";
import { authorizeRequest } from "@/server/auth/permissions";

/**
 * The sidebar/tab-title live count (BUILD_PLAN.md S21, extended S17): polled from the panel every
 * 45s while the tab is visible. Returns the same needs-action counts the sidebar renders on first
 * load (`getOrderCountsForPermissions`/`getWholesaleCountsForPermissions`), so the two never
 * disagree. A GET with no side effects: no Origin check needed (ARCHITECTURE.md §4.5 reserves that
 * for state-changing requests).
 */
export async function GET() {
  const auth = await authorizeRequest(PERMISSIONS.ORDER_VIEW, PERMISSIONS.WHOLESALE_VIEW);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const [orderCounts, wholesaleCounts] = await Promise.all([
    getOrderCountsForPermissions(auth.session.permissions),
    getWholesaleCountsForPermissions(auth.session.permissions),
  ]);
  return NextResponse.json({ ...orderCounts, ...wholesaleCounts });
}
