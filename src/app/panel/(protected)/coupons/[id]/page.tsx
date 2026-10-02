import { notFound } from "next/navigation";
import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { StatusPill } from "@/components/panel/StatusPill";
import { CouponForm } from "@/components/panel/coupons/CouponForm";
import { CouponActiveToggle } from "@/components/panel/coupons/CouponRowActions";
import { CouponUsageCard } from "@/components/panel/coupons/CouponUsageCard";
import { DeleteCouponDialog } from "@/components/panel/coupons/DeleteCouponDialog";
import { PERMISSIONS } from "@/features/auth/permissions";
import { couponBackHrefSchema } from "@/features/coupons/schemas";
import { checkCouponDeletable, getCouponForEdit } from "@/features/coupons/staff-service";
import { COUPON_STATUS_COLORS, COUPON_STATUS_LABELS } from "@/features/coupons/status";
import { utcToKarachiLocal } from "@/lib/karachi-datetime";
import { requirePermission } from "@/server/auth/permissions";
import { updateCouponAction } from "@/app/panel/(protected)/coupons/actions";

export default async function EditCouponPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const session = await requirePermission(PERMISSIONS.COUPON_MANAGE);
  const { id } = await params;
  const couponId = Number(id);
  if (!Number.isInteger(couponId) || couponId <= 0) notFound();

  const { back } = await searchParams;
  const backHref = couponBackHrefSchema.parse(back) ?? "/panel/coupons";

  const [formData, deleteGuard] = await Promise.all([
    getCouponForEdit(couponId, { canViewOrders: session.permissions.has(PERMISSIONS.ORDER_VIEW) }),
    checkCouponDeletable(couponId),
  ]);
  if (!formData) notFound();
  const { coupon, status, usage } = formData;

  return (
    <>
      <PanelPageTitle title={coupon.code} />
      <PanelFormHeader title={coupon.code} backHref={backHref} backLabel="Back to coupons">
        <StatusPill label={COUPON_STATUS_LABELS[status]} colors={COUPON_STATUS_COLORS[status]} />
      </PanelFormHeader>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <CouponForm
          // Remounts fresh when the row changes underneath it (the Activate/Deactivate quick action
          // saves without navigating away), so the controlled fields don't echo stale state.
          key={coupon.updatedAt.getTime()}
          mode="edit"
          action={updateCouponAction}
          usageCount={usage.count}
          backHref={backHref}
          minDateTime={utcToKarachiLocal(new Date())}
          initial={{
            id: coupon.id,
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            minOrder: coupon.minOrder ?? "",
            maxDiscount: coupon.maxDiscount ?? "",
            usageLimit: coupon.usageLimit === null ? "" : String(coupon.usageLimit),
            perCustomerLimit: coupon.perCustomerLimit === null ? "" : String(coupon.perCustomerLimit),
            startsAt: coupon.startsAt ? utcToKarachiLocal(coupon.startsAt) : "",
            endsAt: coupon.endsAt ? utcToKarachiLocal(coupon.endsAt) : "",
            isActive: coupon.isActive,
          }}
          actionsSlot={
            <div className="flex items-center gap-2">
              <CouponActiveToggle id={coupon.id} isActive={coupon.isActive} variant="button" />
              <DeleteCouponDialog id={coupon.id} code={coupon.code} isActive={coupon.isActive} guard={deleteGuard} />
            </div>
          }
        />
        {/* Beside the form on desktop, below it on phones; outside the form either way. */}
        <div className="w-full lg:max-w-xs">
          <CouponUsageCard usage={usage} usageLimit={coupon.usageLimit} />
        </div>
      </div>
    </>
  );
}
