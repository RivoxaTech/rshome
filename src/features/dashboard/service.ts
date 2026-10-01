/**
 * The admin dashboard's view layer (BUILD_PLAN.md C28, ARCHITECTURE.md §4.7): resolves the period,
 * runs `repo.ts`'s aggregates (current period and, except "All time", the previous one of the same
 * length), and returns already-formatted strings plus the plain numbers the chart needs to scale
 * (CLAUDE.md rule 5). Every exported getter is `cache()`'d so the period selector, stat cards,
 * chart, most-selling list and recent-orders block each query at most once per request even though
 * the page awaits several of them.
 *
 * `currentRange` deliberately calls `new Date()` directly rather than wrapping it in React's
 * `cache()`: `cache()` only resets at a real Next.js request boundary, so called outside one (a
 * direct service call, as the integration tests and dev scripts do) it freezes "now" at whatever
 * the first call captured — which silently dropped that moment's own orders from every later
 * "resolved against now" query in this exact module during development. The few milliseconds
 * between this page's blocks each calling `new Date()` separately in production make no difference
 * at the day-level granularity these periods resolve to.
 */
import { cache } from "react";
import { siteConfig } from "@/config/site.config";
import { getPrimaryImagesByProductId } from "@/features/catalog/repo";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { orderTab, PAYMENT_METHOD_LABELS, type OrderTab } from "@/features/orders/transitions";
import { bucketSeries, fillDailySeries } from "./chart";
import {
  chooseBucket,
  computeChange,
  dayIndexFromKarachiDateString,
  karachiDayIndex,
  karachiMidnightUtc,
  resolveRange,
  type Bucket,
  type ChangeBadge,
  type RangeKey,
  type ResolvedRange,
} from "./ranges";
import {
  getDailyRevenueSeries,
  getEarliestOrderCreatedAt,
  getMostSellingProducts,
  getOrderAggregates,
  getRecentOrders,
  getWholesaleLeadsCount,
} from "./repo";

export function currentRange(rangeKey: RangeKey): ResolvedRange {
  return resolveRange(rangeKey, new Date());
}

const money = (paisa: number) => formatMoney(paisa);
const toPaisa = (decimal: string) => decimalToPaisa(decimal);

// ── Stat cards ──────────────────────────────────────────────────────────────────────────────

/** Keyed on primitive ms timestamps (not `Date` objects) so repeated calls within one request actually dedupe. */
const orderAggregatesCached = cache((fromMs: number | null, toMs: number) =>
  getOrderAggregates(fromMs === null ? null : new Date(fromMs), new Date(toMs)),
);
const wholesaleLeadsCached = cache((fromMs: number | null, toMs: number) =>
  getWholesaleLeadsCount(fromMs === null ? null : new Date(fromMs), new Date(toMs)),
);

export type StatCard = { key: string; label: string; value: string; sub?: string; change: ChangeBadge };

const NO_COMPARISON: ChangeBadge = { kind: "none", percent: null };

export const getDashboardCards = cache(async (rangeKey: RangeKey): Promise<StatCard[]> => {
  const range = currentRange(rangeKey);
  const fromMs = range.from?.getTime() ?? null;
  const toMs = range.to.getTime();
  const prevFromMs = range.previous?.from.getTime() ?? null;
  const prevToMs = range.previous?.to.getTime();

  const [current, previous, wholesaleCurrent, wholesalePrevious] = await Promise.all([
    orderAggregatesCached(fromMs, toMs),
    prevToMs !== undefined ? orderAggregatesCached(prevFromMs, prevToMs) : null,
    wholesaleLeadsCached(fromMs, toMs),
    prevToMs !== undefined ? wholesaleLeadsCached(prevFromMs, prevToMs) : null,
  ]);

  const revenuePaisa = toPaisa(current.revenuePaisaStr);
  const pendingPaisa = toPaisa(current.pendingPaisaStr);
  const prevRevenuePaisa = previous ? toPaisa(previous.revenuePaisaStr) : null;

  // 0 orders shows a dash (no average to compute); a previous period with 0 orders has no average
  // to compare against either, so the badge is "none" rather than comparing against 0 rupees.
  const avgPaisa = current.orderCount > 0 ? Math.round(toPaisa(current.totalForAvgStr) / current.orderCount) : null;
  const prevAvgPaisa = previous && previous.orderCount > 0 ? Math.round(toPaisa(previous.totalForAvgStr) / previous.orderCount) : null;

  return [
    {
      key: "revenue",
      label: "Revenue",
      value: money(revenuePaisa),
      sub: `Pending ${money(pendingPaisa)}`,
      change: computeChange(revenuePaisa, prevRevenuePaisa),
    },
    {
      key: "orders",
      label: "Total orders",
      value: current.orderCount.toLocaleString("en-PK"),
      change: computeChange(current.orderCount, previous ? previous.orderCount : null),
    },
    {
      key: "aov",
      label: "Average order value",
      value: avgPaisa === null ? "—" : money(avgPaisa),
      change: avgPaisa === null || prevAvgPaisa === null ? NO_COMPARISON : computeChange(avgPaisa, prevAvgPaisa),
    },
    {
      key: "wholesale",
      label: "Total wholesale leads",
      value: wholesaleCurrent.toLocaleString("en-PK"),
      change: computeChange(wholesaleCurrent, wholesalePrevious),
    },
  ];
});

// ── Chart ───────────────────────────────────────────────────────────────────────────────────

export type ChartPointView = { label: string; dateKarachi: string; revenuePaisa: number; revenueLabel: string; orderCount: number };
export type ChartView = { kind: "empty" } | { kind: "data"; bucket: Bucket; points: ChartPointView[] };

const dailySeriesCached = cache((fromMs: number, toMs: number) => getDailyRevenueSeries(new Date(fromMs), new Date(toMs)));
const earliestOrderCached = cache(() => getEarliestOrderCreatedAt());

export const getDashboardChart = cache(async (rangeKey: RangeKey): Promise<ChartView> => {
  const range = currentRange(rangeKey);
  const toDayIndex = karachiDayIndex(range.to);

  let fromDayIndex: number;
  if (range.from) {
    fromDayIndex = karachiDayIndex(range.from);
  } else {
    const earliest = await earliestOrderCached();
    if (!earliest) return { kind: "empty" };
    fromDayIndex = karachiDayIndex(earliest);
  }
  if (fromDayIndex > toDayIndex) return { kind: "empty" };

  const bucket = chooseBucket(toDayIndex - fromDayIndex + 1);
  const from = range.from ?? karachiMidnightUtc(fromDayIndex);
  const rows = await dailySeriesCached(from.getTime(), range.to.getTime());
  const daily = fillDailySeries(
    rows.map((row) => ({
      dayIndex: dayIndexFromKarachiDateString(row.karachiDate),
      revenuePaisa: toPaisa(row.revenuePaisaStr),
      orderCount: row.orderCount,
    })),
    fromDayIndex,
    toDayIndex,
  );
  const bucketed = bucketSeries(daily, bucket);
  if (bucketed.length === 0) return { kind: "empty" };

  return {
    kind: "data",
    bucket,
    points: bucketed.map((point) => ({
      label: point.label,
      dateKarachi: point.dateKarachi,
      revenuePaisa: point.revenuePaisa,
      revenueLabel: money(point.revenuePaisa),
      orderCount: point.orderCount,
    })),
  };
});

// ── Most selling products ───────────────────────────────────────────────────────────────────

export type TopProductView = {
  productId: number;
  name: string;
  unitsSold: number;
  revenue: string;
  image: { path: string; width: number; height: number; alt: string } | null;
};

export const getMostSellingProductsView = cache(async (rangeKey: RangeKey): Promise<TopProductView[]> => {
  const range = currentRange(rangeKey);
  const rows = await getMostSellingProducts(range.from, range.to, 5);
  const images = await getPrimaryImagesByProductId(rows.map((row) => row.productId));
  return rows.map((row) => {
    const image = images.get(row.productId);
    return {
      productId: row.productId,
      name: row.name,
      unitsSold: row.unitsSold,
      revenue: money(toPaisa(row.revenuePaisaStr)),
      image: image ? { path: image.path, width: image.width, height: image.height, alt: image.alt ?? row.name } : null,
    };
  });
});

// ── Recent orders ───────────────────────────────────────────────────────────────────────────

const dateOnly = new Intl.DateTimeFormat("en-GB", { timeZone: siteConfig.timezone, day: "numeric", month: "short" });

export type RecentOrderView = {
  orderNumber: string;
  customerName: string;
  placedDate: string;
  total: string;
  paymentMethodLabel: string;
  tab: OrderTab;
  href: string;
};

export const getRecentOrdersView = cache(async (): Promise<RecentOrderView[]> => {
  const rows = await getRecentOrders(8);
  return rows.map((row) => ({
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    placedDate: dateOnly.format(row.createdAt),
    total: money(toPaisa(row.total)),
    paymentMethodLabel: PAYMENT_METHOD_LABELS[row.paymentMethod],
    tab: orderTab(row),
    href: `/panel/orders/${row.paymentMethod === "bank_transfer" ? "bank" : "cod"}/${row.orderNumber}`,
  }));
});
