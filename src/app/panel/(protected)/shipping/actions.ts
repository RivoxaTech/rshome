"use server";

import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/features/auth/permissions";
import { moveToPlacementSchema } from "@/features/catalog/schemas";
import type { Placement } from "@/features/catalog/ordering";
import {
  createZone,
  deleteZoneById,
  moveZone,
  setZoneActive,
  testDestination,
  updateZoneById,
  type StaffActionResult,
  type TestDestinationResult,
} from "@/features/shipping/staff-service";
import { parseFormId } from "@/lib/form-id";
import { requirePermission } from "@/server/auth/permissions";

const NOT_FOUND: StaffActionResult = { ok: false, error: "Zone not found." };

export async function createZoneAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  const result = await createZone(Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/shipping");
  return result;
}

export async function updateZoneAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await updateZoneById(id, Object.fromEntries(formData), { id: session.id });
  if (result.ok) redirect("/panel/shipping");
  return result;
}

/** The list row's / edit page's / delete dialog's one-click Activate/Deactivate: never redirects, the caller refreshes in place. */
export async function setZoneActiveAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  return setZoneActive(id, formData.get("isActive") === "true", { id: session.id });
}

export async function deleteZoneAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const result = await deleteZoneById(id, { id: session.id });
  if (result.ok) redirect("/panel/shipping");
  return result;
}

/** The list's per-row `MoveToControl`: `id`, `placement` and (for "position") `position`. */
export async function moveZoneAction(_prevState: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const session = await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  const id = parseFormId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const parsed = moveToPlacementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Choose where to move it." };
  const placement: Placement = parsed.data.placement === "position" ? { type: "position", position: parsed.data.position as number } : { type: parsed.data.placement };
  return moveZone({ zoneId: id, placement }, { id: session.id });
}

/** "Test a destination": read-only, but still `shipping.manage` — it's a panel tool, not a public endpoint. */
export async function testDestinationAction(_prevState: TestDestinationResult | null, formData: FormData): Promise<TestDestinationResult> {
  await requirePermission(PERMISSIONS.SHIPPING_MANAGE);
  return testDestination(Object.fromEntries(formData));
}
