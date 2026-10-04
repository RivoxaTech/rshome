import type { Metadata } from "next";
import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { ZoneForm } from "@/components/panel/shipping/ZoneForm";
import { getCountryOptions } from "@/config/countries";
import { PERMISSIONS } from "@/features/auth/permissions";
import { zoneBackHrefSchema } from "@/features/shipping/schemas";
import { fallbackExists } from "@/features/shipping/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { createZoneAction } from "@/app/panel/(protected)/shipping/actions";

export const metadata: Metadata = { title: "New zone" };

export default async function NewZonePage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  const { back } = await searchParams;
  const backHref = zoneBackHrefSchema.parse(back) ?? "/panel/shipping";
  const hasFallback = await fallbackExists();

  return (
    <>
      <PanelPageTitle title="New zone" />
      <PanelFormHeader title="New shipping zone" backHref={backHref} backLabel="Back to shipping zones" />
      <ZoneForm
        mode="create"
        action={createZoneAction}
        backHref={backHref}
        version=""
        countries={getCountryOptions()}
        offerFallback={!hasFallback}
        initial={{ id: null, name: "", mode: "quote", flatRate: "", freeOverAmount: "", codEnabled: false, isActive: true, isFallback: false, areas: [] }}
      />
    </>
  );
}
