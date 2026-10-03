/**
 * Order CSV export (S18, REQUIREMENTS AD-06): one row per order. Column formatting only — the
 * BOM/CRLF/quoting/formula-injection rules live once in `features/csv/writer.ts`.
 */
import { buildCsv } from "@/features/csv/writer";
import { siteConfig } from "@/config/site.config";
import { formatPhone } from "@/lib/phone";
import { listOrdersForExport, type OrderExportRow } from "./staff-repo";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "./transitions";
import type { PaymentMethod } from "./status";
import type { OrderTab } from "./transitions";

export const ORDER_EXPORT_ROW_CAP = 5000;

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

const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: siteConfig.timezone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

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

export async function buildOrderExportCsv(filter: {
  method: PaymentMethod | "all";
  tab: OrderTab | "all";
  from: Date;
  to: Date;
}): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
  const { rows, truncated } = await listOrdersForExport({ ...filter, limit: ORDER_EXPORT_ROW_CAP });
  return { csv: buildCsv(ORDER_EXPORT_HEADERS, rows.map(orderExportRowValues)), rowCount: rows.length, truncated };
}
