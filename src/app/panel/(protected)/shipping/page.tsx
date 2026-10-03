import Link from "next/link";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { TestDestinationBox } from "@/components/panel/shipping/TestDestinationBox";
import { ZonesTable } from "@/components/panel/shipping/ZonesTable";
import { DEFAULT_COUNTRY, getCountryOptions } from "@/config/countries";
import { PERMISSIONS } from "@/features/auth/permissions";
import { listStaffZones } from "@/features/shipping/staff-service";
import { requirePermission } from "@/server/auth/permissions";

const BASE_PATH = "/panel/shipping";

/** The shipping zone editor (REQUIREMENTS DV-06, `shipping.manage`): every zone, plus a destination tester. */
export default async function ShippingPage() {
  await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  const items = await listStaffZones();

  return (
    <>
      <PanelPageTitle title="Shipping" />
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold">Shipping zones</h1>
            <p className="text-muted-foreground text-sm">An address resolves to its city&apos;s zone, else its country&apos;s, else the rest-of-world zone. The list order is just this page&apos;s.</p>
          </div>
          <Link href={`/panel/shipping/new?back=${encodeURIComponent(BASE_PATH)}`} className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap">
            New zone
          </Link>
        </div>
        <ZonesTable items={items} backHref={BASE_PATH} />
        <div className="mt-2 max-w-2xl">
          <TestDestinationBox countries={getCountryOptions()} defaultCountry={DEFAULT_COUNTRY} />
        </div>
      </div>
    </>
  );
}
