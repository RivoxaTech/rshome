import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { exportWholesaleForStaff } from "@/features/wholesale/staff-service";
import { WHOLESALE_STATUSES, type WholesaleStatus } from "@/features/wholesale/transitions";
import { authorizeRequest } from "@/server/auth/permissions";

/**
 * The current filter's CSV (S17): matches whatever tab/search the list page is showing. The CSV,
 * the audit row and the capped-export file name are the service's (`exportWholesaleForStaff`).
 */
export async function GET(request: Request) {
  const auth = await authorizeRequest(PERMISSIONS.WHOLESALE_VIEW);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const url = new URL(request.url);
  const tabParam = url.searchParams.get("tab") ?? "";
  const tab: WholesaleStatus | "all" = (WHOLESALE_STATUSES as readonly string[]).includes(tabParam) ? (tabParam as WholesaleStatus) : "all";
  const q = url.searchParams.get("q")?.trim().slice(0, 100) || undefined;

  const { csv, filename } = await exportWholesaleForStaff(tab, q, { id: auth.session.id });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
