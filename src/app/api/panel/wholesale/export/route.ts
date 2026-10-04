import { NextResponse } from "next/server";
import { insertAuditLog } from "@/features/audit/repo";
import { PERMISSIONS } from "@/features/auth/permissions";
import { buildWholesaleExport } from "@/features/wholesale/staff-service";
import { WHOLESALE_STATUSES, type WholesaleStatus } from "@/features/wholesale/transitions";
import { KARACHI_OFFSET_MS } from "@/lib/karachi-datetime";
import { authorizeRequest } from "@/server/auth/permissions";
import { db } from "@/server/db/client";

/**
 * The current filter's CSV (S17): matches whatever tab/search the list page is showing. Like the
 * orders export, it records an audit row and marks a capped export in the file name (S22 BUG-24).
 */
export async function GET(request: Request) {
  const auth = await authorizeRequest(PERMISSIONS.WHOLESALE_VIEW);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const url = new URL(request.url);
  const tabParam = url.searchParams.get("tab") ?? "";
  const tab: WholesaleStatus | "all" = (WHOLESALE_STATUSES as readonly string[]).includes(tabParam) ? (tabParam as WholesaleStatus) : "all";
  const q = url.searchParams.get("q")?.trim().slice(0, 100) || undefined;

  const now = new Date();
  const { csv, rowCount, truncated } = await buildWholesaleExport(tab, q);
  await insertAuditLog(db, {
    userId: auth.session.id,
    action: "wholesale.export",
    entity: "wholesale_export",
    entityId: tab,
    oldValues: null,
    newValues: { tab, q: q ?? null, rowCount, truncated },
    createdAt: now,
  });

  const day = new Date(now.getTime() + KARACHI_OFFSET_MS).toISOString().slice(0, 10);
  const filename = `wholesale-inquiries-${day}${truncated ? "-first-rows-only" : ""}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
