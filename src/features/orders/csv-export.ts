/**
 * Order CSV export (S18, REQUIREMENTS AD-06): one row per order, the date-range defaults and the
 * audit row. Column formatting only — the BOM/CRLF/quoting/formula-injection rules live once in
 * `features/csv/writer.ts`.
 */
import { insertAuditLog } from "@/features/audit/repo";
import { buildCsv } from "@/features/csv/writer";
import { karachiDayIndex, karachiMidnightUtc, parseKarachiDateString } from "@/features/dashboard/ranges";
import { KARACHI_OFFSET_MS, karachiFormatter } from "@/lib/karachi-datetime";
import { formatPhone } from "@/lib/phone";
import { db } from "@/server/db/client";
import { listOrdersForExport, type OrderExportRow } from "./staff-repo";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "./transitions";
import type { PaymentMethod } from "./status";
import type { OrderTab } from "./transitions";

const ORDER_EXPORT_ROW_CAP = 5000;

export const ORDER_EXPORT_HEADERS = [
  "Order number",
  "Created at",
  "Status",
  "Payment method",
  "Payment status",
  "Customer name",
  "Phone",
  "City",
  "Country",
  "Items",
  "Subtotal",
  "Discount",
  "Delivery charge",
  "Total",
  "Coupon code",
];

const dateTime = karachiFormatter({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function orderExportRowValues(row: OrderExportRow): string[] {
  return [
    row.orderNumber,
    dateTime.format(row.createdAt),
    ORDER_STATUS_LABELS[row.orderStatus],
    PAYMENT_METHOD_LABELS[row.paymentMethod],
    PAYMENT_STATUS_LABELS[row.paymentStatus],
    row.customerName,
    formatPhone(row.phone),
    row.city,
    row.country,
    String(row.itemsCount),
    row.subtotal,
    row.discountTotal,
    row.shippingTotal ?? "",
    row.total,
    row.couponCode ?? "",
  ];
}

async function buildOrderExportCsv(filter: {
  method: PaymentMethod | "all";
  tab: OrderTab | "all";
  from: Date;
  to: Date;
}): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
  const { rows, truncated } = await listOrdersForExport({ ...filter, limit: ORDER_EXPORT_ROW_CAP });
  return { csv: buildCsv(ORDER_EXPORT_HEADERS, rows.map(orderExportRowValues)), rowCount: rows.length, truncated };
}

/**
 * The export route's whole job (`order.export`, checked by the route): a Karachi date range that
 * defaults to the last 30 days when `from`/`to` are missing or impossible (so a client cannot widen
 * the export by omitting them; `to` is inclusive, as the day after it at midnight), the CSV, and an
 * `order.export` audit row.
 */
export async function exportOrdersForStaff(
  filter: { method: PaymentMethod | "all"; tab: OrderTab | "all"; from: string | null; to: string | null },
  actor: { id: number },
): Promise<{ csv: string; filename: string }> {
  const now = new Date();
  const todayIndex = karachiDayIndex(now);
  const fromDayIndex = parseKarachiDateString(filter.from) ?? todayIndex - 29;
  const toDayIndex = parseKarachiDateString(filter.to) ?? todayIndex;
  const from = karachiMidnightUtc(Math.min(fromDayIndex, toDayIndex));
  const to = karachiMidnightUtc(Math.max(fromDayIndex, toDayIndex) + 1);
  const { method, tab } = filter;

  const { csv, rowCount, truncated } = await buildOrderExportCsv({ method, tab, from, to });

  await db.transaction((tx) =>
    insertAuditLog(tx, {
      userId: actor.id,
      action: "order.export",
      entity: "order_export",
      entityId: `${method}:${tab}`,
      oldValues: null,
      newValues: { method, tab, from: from.toISOString(), to: to.toISOString(), rowCount, truncated },
      createdAt: now,
    }),
  );

  const filename = `orders-${new Date(now.getTime() + KARACHI_OFFSET_MS).toISOString().slice(0, 10)}.csv`;
  return { csv, filename };
}
