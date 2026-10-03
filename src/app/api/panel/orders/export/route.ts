import { NextResponse } from "next/server";
import { insertAuditLog } from "@/features/audit/repo";
import { PERMISSIONS } from "@/features/auth/permissions";
import { karachiDayIndex, karachiMidnightUtc, dayIndexFromKarachiDateString } from "@/features/dashboard/ranges";
import { buildOrderExportCsv } from "@/features/orders/csv-export";
import { ORDER_TABS, type OrderTab } from "@/features/orders/transitions";
import { db } from "@/server/db/client";
import { authorizeRequest } from "@/server/auth/permissions";

const METHODS = ["bank_transfer", "cod", "all"] as const;
type ExportMethod = (typeof METHODS)[number];

function parseDayIndex(value: string | null, fallback: number): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return dayIndexFromKarachiDateString(value);
}

/**
 * The orders list's CSV export (S18, REQUIREMENTS AD-06, `order.export`, Admin only). Defaults to
 * the last 30 days when `from`/`to` are missing or invalid, so the client can't widen the export
 * by simply omitting them.
 */
export async function GET(request: Request) {
  const auth = await authorizeRequest(PERMISSIONS.ORDER_EXPORT);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const url = new URL(request.url);
  const methodParam = url.searchParams.get("method") ?? "all";
  const method: ExportMethod = (METHODS as readonly string[]).includes(methodParam) ? (methodParam as ExportMethod) : "all";
  const tabParam = url.searchParams.get("tab") ?? "all";
  const tab: OrderTab | "all" = (ORDER_TABS as readonly string[]).includes(tabParam) ? (tabParam as OrderTab) : "all";

  const now = new Date();
  const todayIndex = karachiDayIndex(now);
  const fromDayIndex = parseDayIndex(url.searchParams.get("from"), todayIndex - 29);
  const toDayIndex = parseDayIndex(url.searchParams.get("to"), todayIndex);
  const from = karachiMidnightUtc(Math.min(fromDayIndex, toDayIndex));
  const to = karachiMidnightUtc(Math.max(fromDayIndex, toDayIndex) + 1);

  const { csv, rowCount, truncated } = await buildOrderExportCsv({ method, tab, from, to });

  await db.transaction((tx) =>
    insertAuditLog(tx, {
      userId: auth.session.id,
      action: "order.export",
      entity: "order_export",
      entityId: `${method}:${tab}`,
      oldValues: null,
      newValues: { method, tab, from: from.toISOString(), to: to.toISOString(), rowCount, truncated },
      createdAt: now,
    }),
  );

  const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
