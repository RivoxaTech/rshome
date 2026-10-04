import type { Metadata } from "next";
import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { CouponForm } from "@/components/panel/coupons/CouponForm";
import { PERMISSIONS } from "@/features/auth/permissions";
import { couponBackHrefSchema } from "@/features/coupons/schemas";
import { utcToKarachiLocal } from "@/lib/karachi-datetime";
import { requirePermission } from "@/server/auth/permissions";
import { createCouponAction } from "@/app/panel/(protected)/coupons/actions";

export const metadata: Metadata = { title: "New coupon" };

export default async function NewCouponPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  await requirePermission(PERMISSIONS.COUPON_MANAGE);
  const { back } = await searchParams;
  const backHref = couponBackHrefSchema.parse(back) ?? "/panel/coupons";

  return (
    <>
      <PanelPageTitle title="New coupon" />
      <PanelFormHeader title="New coupon" backHref={backHref} backLabel="Back to coupons" />
      <CouponForm
        mode="create"
        action={createCouponAction}
        usageCount={0}
        backHref={backHref}
        minDateTime={utcToKarachiLocal(new Date())}
        initial={{ id: null, code: "", type: "percent", value: "", minOrder: "", maxDiscount: "", usageLimit: "", perCustomerLimit: "", startsAt: "", endsAt: "", isActive: true }}
      />
    </>
  );
}
