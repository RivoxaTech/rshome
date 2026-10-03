import { notFound } from "next/navigation";
import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { StatusPill } from "@/components/panel/StatusPill";
import { DeleteZoneDialog } from "@/components/panel/shipping/DeleteZoneDialog";
import { ZoneForm } from "@/components/panel/shipping/ZoneForm";
import { ZoneActiveToggle } from "@/components/panel/shipping/ZoneRowActions";
import { getCountryOptions } from "@/config/countries";
import { PERMISSIONS } from "@/features/auth/permissions";
import { zoneBackHrefSchema } from "@/features/shipping/schemas";
import { checkZoneDeletable, getZoneForEdit } from "@/features/shipping/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { updateZoneAction } from "@/app/panel/(protected)/shipping/actions";

const ACTIVE_COLORS = { dot: "bg-emerald-500", bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" };
const INACTIVE_COLORS = { dot: "bg-muted-foreground/60", bg: "bg-muted", text: "text-muted-foreground" };
const FALLBACK_COLORS = { dot: "bg-sky-500", bg: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-400" };

export default async function EditZonePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  const { id } = await params;
  const zoneId = Number(id);
  if (!Number.isInteger(zoneId) || zoneId <= 0) notFound();

  const { back } = await searchParams;
  const backHref = zoneBackHrefSchema.parse(back) ?? "/panel/shipping";

  const [formData, deleteGuard] = await Promise.all([getZoneForEdit(zoneId), checkZoneDeletable(zoneId)]);
  if (!formData) notFound();
  const { zone, areas, version, orderCount } = formData;

  return (
    <>
      <PanelPageTitle title={zone.name} />
      <PanelFormHeader title={zone.name} backHref={backHref} backLabel="Back to shipping zones">
        <StatusPill label={zone.isActive ? "Active" : "Inactive"} colors={zone.isActive ? ACTIVE_COLORS : INACTIVE_COLORS} />
        {zone.isFallback && <StatusPill label="Rest of world" colors={FALLBACK_COLORS} />}
        <span className="text-muted-foreground text-xs">
          {orderCount} {orderCount === 1 ? "order" : "orders"}
        </span>
      </PanelFormHeader>
      <ZoneForm
        // Remounts fresh when the row changes underneath it (the quick action saves without navigating away).
        key={version}
        mode="edit"
        action={updateZoneAction}
        backHref={backHref}
        version={version}
        countries={getCountryOptions()}
        offerFallback={false}
        initial={{
          id: zone.id,
          name: zone.name,
          mode: zone.mode,
          flatRate: zone.flatRate,
          freeOverAmount: zone.freeOverAmount ?? "",
          codEnabled: zone.codEnabled,
          isActive: zone.isActive,
          isFallback: zone.isFallback,
          areas,
        }}
        actionsSlot={
          <div className="flex items-center gap-2">
            {!zone.isFallback && <ZoneActiveToggle id={zone.id} isActive={zone.isActive} variant="button" />}
            <DeleteZoneDialog id={zone.id} name={zone.name} isActive={zone.isActive} guard={deleteGuard} />
          </div>
        }
      />
    </>
  );
}
