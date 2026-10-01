import { requirePermission } from "@/server/auth/permissions";
import { PERMISSIONS } from "@/features/auth/permissions";

// Stub pending S10 (products CRUD). Gated on product.view, which only the Developer holds
// (BUILD_PLAN.md C24) — S10 adds the create/update/delete actions on top of this read gate.
export default async function ProductsPage() {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Products</h1>
      <p className="text-muted-foreground text-sm">Catalogue management arrives in slice S10.</p>
    </div>
  );
}
