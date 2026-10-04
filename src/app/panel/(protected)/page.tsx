import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DashboardPeriodSelector } from "@/components/panel/dashboard/DashboardPeriodSelector";
import { MostSellingList } from "@/components/panel/dashboard/MostSellingList";
import { RecentOrdersTable } from "@/components/panel/dashboard/RecentOrdersTable";
import { RevenueChart } from "@/components/panel/dashboard/RevenueChart";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { Skeleton } from "@/components/panel/Skeleton";
import { StatCard } from "@/components/panel/dashboard/StatCard";
import { firstAllowedPath } from "@/features/auth/landing";
import { PERMISSIONS } from "@/features/auth/permissions";
import type { RangeKey } from "@/features/dashboard/ranges";
import { dashboardQuerySchema } from "@/features/dashboard/schemas";
import { getDashboardCards, getDashboardChart, getMostSellingProductsView, getRecentOrdersView } from "@/features/dashboard/service";
import { requireSession } from "@/server/auth/permissions";

export const metadata: Metadata = { title: "Dashboard" };

async function ChartSection({ range }: { range: RangeKey }) {
  const chart = await getDashboardChart(range);
  return <RevenueChart chart={chart} />;
}

async function MostSellingSection({ range }: { range: RangeKey }) {
  const products = await getMostSellingProductsView(range);
  return <MostSellingList products={products} />;
}

async function RecentOrdersSection() {
  const orders = await getRecentOrdersView();
  return <RecentOrdersTable orders={orders} />;
}

/**
 * The admin dashboard (BUILD_PLAN.md C28, ARCHITECTURE.md §4.7). The Developer no longer holds
 * `dashboard.view` (C24), so this is never their landing page — redirect to their own
 * first-allowed page instead of the generic 403 (S9b).
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  if (!session.permissions.has(PERMISSIONS.DASHBOARD_VIEW)) redirect(firstAllowedPath(session.permissions));

  const { range } = dashboardQuerySchema.parse(await searchParams);
  const cards = await getDashboardCards(range);

  return (
    <>
      <PanelPageTitle title="Dashboard" />
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">Welcome back, {session.name}</p>
        <DashboardPeriodSelector current={range} />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.key} card={card} />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Suspense key={`chart-${range}`} fallback={<Skeleton className="h-72 rounded-lg" />}>
              <ChartSection range={range} />
            </Suspense>
          </div>
          <Suspense key={`most-selling-${range}`} fallback={<Skeleton className="h-72 rounded-lg" />}>
            <MostSellingSection range={range} />
          </Suspense>
        </div>
        <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
          <RecentOrdersSection />
        </Suspense>
      </div>
    </>
  );
}
