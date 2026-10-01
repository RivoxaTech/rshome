"use client";

import { useId, useState } from "react";
import { DetailCard } from "@/components/panel/DetailCard";
import { TAB_COLORS } from "@/components/panel/orders/tab-colors";
import { buildSmoothAreaPath, buildSmoothPath, scaleLinear } from "@/features/dashboard/chart";
import type { ChartView } from "@/features/dashboard/service";
import { formatMoney } from "@/features/pricing/money";

/** The same muted orange as the orders list's "Pending delivery charge" pill (`tab-colors.ts`), not the brighter `orange-500` — so the chart's Orders colour always matches what the owner compared it against. */
const ORDERS_COLOR = TAB_COLORS.pending_delivery.text;

const WIDTH = 760;
const HEIGHT = 300;
const PAD = { top: 20, right: 8, bottom: 24, left: 8 };
const GRID_LINES = 4;

const BUCKET_WORD = { day: "day", week: "week", month: "month" } as const;

/** Revenue is an ivory/champagne tone, Orders the same muted orange as the "Pending delivery charge" pill — distinct at a glance. */
function Legend() {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="bg-champagne inline-block h-2 w-2 rounded-full" /> Revenue
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-orange-700 dark:bg-orange-400" /> Orders
      </span>
    </div>
  );
}

/**
 * The revenue + order-count chart (C28): plain inline SVG, no charting library (CLAUDE.md #1 —
 * a dependency needs a stated reason, and this is simple enough without one). A smoothed curve
 * (`buildSmoothPath`) and a gradient fill under Revenue, in the style of the owner's reference
 * dashboard. Two independent y-scales so both series read clearly regardless of their absolute
 * magnitudes. `role="img"` plus a visually hidden `<table>` carry the same data for assistive
 * tech; empty/one-point periods get a plain message instead of an unreadable sliver of a chart.
 */
export function RevenueChart({ chart }: { chart: ChartView }) {
  const titleId = useId();
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  if (chart.kind === "empty") {
    return (
      <DetailCard title="Revenue" className="h-full">
        <p className="text-muted-foreground text-sm">No orders in this period yet.</p>
      </DetailCard>
    );
  }

  const { points, bucket } = chart;

  if (points.length === 1) {
    const only = points[0];
    return (
      <DetailCard title="Revenue" className="h-full">
        <p className="text-muted-foreground text-sm">
          Only one {BUCKET_WORD[bucket]} of data so far ({only.label}): {only.revenueLabel}, {only.orderCount} order{only.orderCount === 1 ? "" : "s"}.
        </p>
      </DetailCard>
    );
  }

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const baselineY = PAD.top + plotHeight;
  const xFor = scaleLinear([0, points.length - 1], [PAD.left, WIDTH - PAD.right]);
  const revenueMax = Math.max(1, ...points.map((point) => point.revenuePaisa));
  const orderMax = Math.max(1, ...points.map((point) => point.orderCount));
  const yRevenue = scaleLinear([0, revenueMax], [baselineY, PAD.top]);
  const yOrders = scaleLinear([0, orderMax], [baselineY, PAD.top]);

  const revenuePoints = points.map((point, index) => ({ x: xFor(index), y: yRevenue(point.revenuePaisa) }));
  const orderPoints = points.map((point, index) => ({ x: xFor(index), y: yOrders(point.orderCount) }));
  const bandWidth = plotWidth / points.length;
  const gridY = Array.from({ length: GRID_LINES }, (_, i) => PAD.top + (plotHeight * i) / (GRID_LINES - 1));

  // Only every Nth x-axis label, so they never overlap on a 30+ point chart.
  const labelEvery = Math.ceil(points.length / 6);

  const totalRevenue = points.reduce((sum, point) => sum + point.revenuePaisa, 0);
  const totalOrders = points.reduce((sum, point) => sum + point.orderCount, 0);
  const summary = `Revenue and orders by ${BUCKET_WORD[bucket]}, ${points[0].label} to ${points[points.length - 1].label}: ${formatMoney(totalRevenue)} across ${totalOrders} orders in total. Full figures are in the table below.`;

  return (
    <DetailCard title="Revenue" action={<Legend />} className="h-full">
      <div className="relative min-h-[220px] w-full flex-1">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-labelledby={titleId}
          className="h-full w-full"
          onMouseLeave={() => setActive(null)}
        >
          <title id={titleId}>{`Revenue and order count per ${BUCKET_WORD[bucket]}: ${totalOrders} orders in total`}</title>
          <desc>{summary}</desc>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" className="text-champagne" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-champagne" />
            </linearGradient>
          </defs>

          {gridY.map((y, index) => (
            <line key={index} x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="currentColor" strokeWidth="1" className="text-border" />
          ))}

          <path d={buildSmoothAreaPath(revenuePoints, baselineY)} fill={`url(#${gradientId})`} stroke="none" />
          <path d={buildSmoothPath(orderPoints)} fill="none" strokeWidth="2" stroke="currentColor" className={ORDERS_COLOR} />
          <path d={buildSmoothPath(revenuePoints)} fill="none" strokeWidth="2.5" stroke="currentColor" className="text-champagne" />

          {points.map((point, index) =>
            index % labelEvery === 0 ? (
              <text key={point.dateKarachi} x={xFor(index)} y={HEIGHT - 4} textAnchor="middle" fontSize="10" fill="currentColor" className="text-muted-foreground">
                {point.label}
              </text>
            ) : null,
          )}

          {revenuePoints.map((point, index) => (
            <rect
              key={index}
              x={point.x - bandWidth / 2}
              y={PAD.top}
              width={bandWidth}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
              onTouchStart={() => setActive(index)}
            />
          ))}

          {active !== null && (
            <>
              <line
                x1={revenuePoints[active].x}
                x2={revenuePoints[active].x}
                y1={PAD.top}
                y2={baselineY}
                strokeWidth="1"
                stroke="currentColor"
                className="text-border"
              />
              <circle cx={revenuePoints[active].x} cy={revenuePoints[active].y} r="4" fill="currentColor" className="text-champagne" />
              <circle cx={orderPoints[active].x} cy={orderPoints[active].y} r="3.5" fill="currentColor" className={ORDERS_COLOR} />
            </>
          )}
        </svg>
        {active !== null && (
          <div
            className="border-border bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm"
            style={{ left: `${(revenuePoints[active].x / WIDTH) * 100}%`, top: 0, transform: "translate(-50%, -100%)" }}
          >
            <p className="font-medium">{points[active].label}</p>
            <p>{points[active].revenueLabel}</p>
            <p className="text-muted-foreground">
              {points[active].orderCount} order{points[active].orderCount === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>
      {/*
        A <table> defaults to table-layout: auto, which treats sr-only's width/height as a
        minimum, not a cap — the table still lays out at its full natural size (every row), and
        with no positioned ancestor, that box's absolute position escapes every overflow:hidden/
        auto container up to the document root, inflating the whole page's scroll height even
        though clip-path keeps it invisible. The sr-only div sizes correctly and contains it.
      */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th>{BUCKET_WORD[bucket]}</th>
              <th>Revenue</th>
              <th>Orders</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.dateKarachi}>
                <td>{point.label}</td>
                <td>{point.revenueLabel}</td>
                <td>{point.orderCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailCard>
  );
}
