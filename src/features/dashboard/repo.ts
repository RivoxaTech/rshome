/**
 * The admin dashboard's SQL (BUILD_PLAN.md C28, ARCHITECTURE.md §4.7): one indexed aggregate query
 * per figure, filtered on `orders.created_at`/`wholesale_inquiries.created_at` (both indexed), with
 * the revenue/pending/total-orders/average-order-value definitions from REQUIREMENTS §6.2 applied
 * as conditional `SUM`/`COUNT` inside the one query rather than four round trips. No per-row work.
 */
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { orderItems, orders } from "@/server/db/schema/orders";
import { wholesaleInquiries } from "@/server/db/schema/wholesale";

type Range = { from: Date | null; to: Date };

function createdAtWhere(column: typeof orders.createdAt | typeof wholesaleInquiries.createdAt, range: Range) {
  return range.from ? and(gte(column, range.from), lt(column, range.to)) : lt(column, range.to);
}

/**
 * What the customer actually pays for the goods — `total` minus delivery charge (owner decision,
 * 2 Oct): once staff set a delivery charge, `orders.total` becomes goods + delivery (ARCHITECTURE.md
 * §4.3), but Revenue and Pending revenue on the dashboard are the products' own price only. The
 * delivery charge is a pass-through logistics cost, not sales revenue.
 */
const goodsTotalSql = sql`(${orders.subtotal} - ${orders.discountTotal} - ${orders.couponDiscount})`;

// ── Stat cards ──────────────────────────────────────────────────────────────────────────────

type OrderAggregates = {
  /** DECIMAL(12,2) strings — converted to paisa by the service, never summed as floats here. */
  revenuePaisaStr: string;
  pendingPaisaStr: string;
  orderCount: number;
  totalForAvgStr: string;
};

/**
 * Revenue = the goods price (`goodsTotalSql`, never the delivery charge) of non-cancelled orders
 * whose `payment_status` is verified or cod_collected. Pending revenue = the same goods price for
 * non-cancelled, non-rejected orders not yet in those payment states. Total orders = orders
 * excluding cancelled and rejected; `totalForAvgStr` sums the same orders' `total` (goods + delivery
 * charge once set) for the average order value, which — unlike Revenue — reflects what the
 * customer actually paid in full (REQUIREMENTS §6.2, BUILD_PLAN.md C28, owner decision 2 Oct).
 */
export async function getOrderAggregates(from: Date | null, to: Date): Promise<OrderAggregates> {
  const [row] = await db
    .select({
      // cast(... as decimal(12,2)): without it, MySQL and MariaDB disagree on the reported column
      // type of a `coalesce(sum(case ... then DECIMAL else 0 end), 'string')` expression — one
      // reports it as DECIMAL (mysql2 stringifies it), the other as a plain number, and
      // decimalToPaisa throws on whichever reports a number (S22 follow-up, 7 Oct, found live on
      // production/MariaDB: "decimal.trim is not a function" the moment a period's sum is nonzero,
      // never reproducible on a dev MySQL install or on an always-zero aggregate).
      revenue: sql<string>`cast(coalesce(sum(case when ${orders.orderStatus} != 'cancelled' and ${orders.paymentStatus} in ('verified','cod_collected') then ${goodsTotalSql} else 0 end), 0) as decimal(12,2))`,
      pending: sql<string>`cast(coalesce(sum(case when ${orders.orderStatus} not in ('cancelled','rejected') and ${orders.paymentStatus} not in ('verified','cod_collected') then ${goodsTotalSql} else 0 end), 0) as decimal(12,2))`,
      orderCount: sql<number>`count(case when ${orders.orderStatus} not in ('cancelled','rejected') then 1 end)`,
      totalForAvg: sql<string>`cast(coalesce(sum(case when ${orders.orderStatus} not in ('cancelled','rejected') then ${orders.total} else 0 end), 0) as decimal(12,2))`,
    })
    .from(orders)
    .where(createdAtWhere(orders.createdAt, { from, to }));
  return { revenuePaisaStr: row.revenue, pendingPaisaStr: row.pending, orderCount: Number(row.orderCount), totalForAvgStr: row.totalForAvg };
}

export async function getWholesaleLeadsCount(from: Date | null, to: Date): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(wholesaleInquiries)
    .where(createdAtWhere(wholesaleInquiries.createdAt, { from, to }));
  return row.count;
}

// ── Chart ───────────────────────────────────────────────────────────────────────────────────

type DailyRevenueRow = { karachiDate: string; revenuePaisaStr: string; orderCount: number };

/**
 * One row per Karachi day that had at least one order placed (`dashboard/chart.ts` zero-fills the
 * gaps and buckets into weeks/months). `DATE(created_at + INTERVAL 5 HOUR)` is the same fixed
 * +05:00 offset `ranges.ts` uses, so the two stay consistent without MySQL/MariaDB timezone tables.
 * `revenue` is the same goods-only figure as the stat card (`goodsTotalSql`), so the chart and the
 * card always add up to the same total.
 */
export async function getDailyRevenueSeries(from: Date, to: Date): Promise<DailyRevenueRow[]> {
  const karachiDate = sql<string>`date(date_add(${orders.createdAt}, interval 5 hour))`;
  const rows = await db
    .select({
      karachiDate,
      revenue: sql<string>`cast(coalesce(sum(case when ${orders.orderStatus} != 'cancelled' and ${orders.paymentStatus} in ('verified','cod_collected') then ${goodsTotalSql} else 0 end), 0) as decimal(12,2))`,
      orderCount: sql<number>`count(case when ${orders.orderStatus} not in ('cancelled','rejected') then 1 end)`,
    })
    .from(orders)
    .where(and(gte(orders.createdAt, from), lt(orders.createdAt, to)))
    .groupBy(karachiDate);
  return rows.map((row) => ({ karachiDate: row.karachiDate, revenuePaisaStr: row.revenue, orderCount: Number(row.orderCount) }));
}

/**
 * A `DATETIME` read back through a plain typed column select comes back as a JS `Date` (the pool's
 * `timezone: 'Z'` config tells mysql2 to treat it as UTC); read through a raw `min()` aggregate it
 * comes back as a plain "YYYY-MM-DD HH:MM:SS" string instead, with no timezone marker — `new
 * Date(value)` would misread that as the server process's local time, not UTC. Parsed explicitly
 * here instead.
 */
function parseUtcDateTime(value: Date | string): Date {
  return value instanceof Date ? value : new Date(`${value.replace(" ", "T")}Z`);
}

/** The earliest order ever placed, for "All time"'s chart start (and nothing else — it's the one unbounded query here). */
export async function getEarliestOrderCreatedAt(): Promise<Date | null> {
  const [row] = await db.select({ earliest: sql<Date | string | null>`min(${orders.createdAt})` }).from(orders);
  return row?.earliest ? parseUtcDateTime(row.earliest) : null;
}

// ── Most selling products ───────────────────────────────────────────────────────────────────

type TopProductRow = { productId: number; name: string; unitsSold: number; revenuePaisaStr: string };

/**
 * Top units sold from `order_items` of orders not cancelled or rejected, in the period. Grouped by
 * `product_id` so a product's variants collapse into one row; `name_snapshot` (already on the
 * order item) stands in for the product name, so no join to `products` is needed.
 */
export async function getMostSellingProducts(from: Date | null, to: Date, limit: number): Promise<TopProductRow[]> {
  const unitsSold = sql<number>`sum(${orderItems.quantity})`;
  const where = and(
    from ? gte(orders.createdAt, from) : undefined,
    lt(orders.createdAt, to),
    sql`${orders.orderStatus} not in ('cancelled','rejected')`,
  );
  const rows = await db
    .select({
      productId: orderItems.productId,
      name: sql<string>`max(${orderItems.nameSnapshot})`,
      unitsSold,
      revenue: sql<string>`sum(${orderItems.lineTotal})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(where)
    .groupBy(orderItems.productId)
    .orderBy(desc(unitsSold))
    .limit(limit);
  return rows.map((row) => ({ productId: row.productId, name: row.name, unitsSold: Number(row.unitsSold), revenuePaisaStr: row.revenue }));
}

// ── Recent orders ───────────────────────────────────────────────────────────────────────────

type RecentOrderRow = {
  orderNumber: string;
  paymentMethod: typeof orders.$inferSelect.paymentMethod;
  orderStatus: typeof orders.$inferSelect.orderStatus;
  paymentStatus: typeof orders.$inferSelect.paymentStatus;
  customerName: string;
  total: string;
  createdAt: Date;
};

/** The latest orders across both payment methods, any status — not period-filtered (the brief). */
export async function getRecentOrders(limit: number): Promise<RecentOrderRow[]> {
  return db
    .select({
      orderNumber: orders.orderNumber,
      paymentMethod: orders.paymentMethod,
      orderStatus: orders.orderStatus,
      paymentStatus: orders.paymentStatus,
      customerName: orders.customerName,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit);
}
