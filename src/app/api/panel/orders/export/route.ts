import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { exportOrdersForStaff } from "@/features/orders/csv-export";
import { ORDER_TABS, type OrderTab } from "@/features/orders/transitions";
import { authorizeRequest } from "@/server/auth/permissions";

const METHODS = ["bank_transfer", "cod", "all"] as const;
type ExportMethod = (typeof METHODS)[number];

/**
 * The orders list's CSV export (S18, REQUIREMENTS AD-06, `order.export`, Admin only). The date
 * defaults, the CSV and the audit row are the service's (`exportOrdersForStaff`).
 */
export async function GET(request: Request) {
  const auth = await authorizeRequest(PERMISSIONS.ORDER_EXPORT);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const url = new URL(request.url);
  const methodParam = url.searchParams.get("method") ?? "all";
  const method: ExportMethod = (METHODS as readonly string[]).includes(methodParam) ? (methodParam as ExportMethod) : "all";
  const tabParam = url.searchParams.get("tab") ?? "all";
  const tab: OrderTab | "all" = (ORDER_TABS as readonly string[]).includes(tabParam) ? (tabParam as OrderTab) : "all";

  const { csv, filename } = await exportOrdersForStaff(
    { method, tab, from: url.searchParams.get("from"), to: url.searchParams.get("to") },
    { id: auth.session.id },
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
