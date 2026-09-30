"use server";

import { refresh } from "next/cache";
import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import {
  addOrderNote,
  approveOrder,
  closeOrder,
  reviewProof,
  updateFulfilment,
  type StaffActionResult,
} from "@/features/orders/staff-actions";
import { ACTION_PERMISSIONS } from "@/features/orders/staff-service";
import { requirePermission } from "@/server/auth/permissions";

type StaffChange = (input: unknown, actor: { id: number }) => Promise<StaffActionResult>;

/** Every permission first (a refusal redirects to 403), then the service, then fresh page data. */
async function run(permissions: PermissionKey[], formData: FormData, change: StaffChange): Promise<StaffActionResult> {
  let userId = 0;
  for (const permission of permissions) userId = (await requirePermission(permission)).id;
  const result = await change(Object.fromEntries(formData), { id: userId });
  if (result.ok) refresh();
  return result;
}

/** It sets the delivery charge, approves the payment screenshot and moves the order on, so it needs all three. */
export async function approveOrderAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run(ACTION_PERMISSIONS.approve, formData, approveOrder);
}

export async function reviewProofAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run([PERMISSIONS.ORDER_VERIFY_PAYMENT], formData, reviewProof);
}

export async function updateFulfilmentAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run([PERMISSIONS.ORDER_UPDATE_STATUS], formData, updateFulfilment);
}

export async function closeOrderAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run([PERMISSIONS.ORDER_UPDATE_STATUS], formData, closeOrder);
}

export async function addOrderNoteAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run([PERMISSIONS.ORDER_UPDATE_STATUS], formData, addOrderNote);
}
