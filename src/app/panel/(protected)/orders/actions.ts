"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { sendOrderApprovedEmail, sendOrderClosedEmail, sendOrderShippedEmail } from "@/features/mail/service";
import {
  addOrderNote,
  approveDeliveryViaWhatsapp,
  approveOrder,
  closeOrder,
  deleteOrder,
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
  const result = await run(ACTION_PERMISSIONS.approve, formData, approveOrder);
  if (result.ok) {
    const orderNumber = String(formData.get("orderNumber"));
    after(() => sendOrderApprovedEmail(orderNumber));
  }
  return result;
}

/** Approving needs only the payment permission; rejecting rejects the whole order, so it needs both. */
export async function reviewProofAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const decision = formData.get("decision");
  const permissions = decision === "reject" ? [PERMISSIONS.ORDER_VERIFY_PAYMENT, PERMISSIONS.ORDER_UPDATE_STATUS] : [PERMISSIONS.ORDER_VERIFY_PAYMENT];
  const result = await run(permissions, formData, reviewProof);
  // D37: rejecting a screenshot rejects the whole order, same as "Cancel/Reject" below. The
  // service hands back the order number (S22 SEC-07: nothing is looked up before the permission check).
  const orderNumber = result.ok ? result.orderNumber : undefined;
  if (orderNumber && decision === "reject") after(() => sendOrderClosedEmail(orderNumber));
  return result;
}

/** "Approve order (paid via WhatsApp)" (D63): same permission as approving a real screenshot. */
export async function approveDeliveryWhatsappAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run([PERMISSIONS.ORDER_VERIFY_PAYMENT], formData, approveDeliveryViaWhatsapp);
}

export async function updateFulfilmentAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const result = await run([PERMISSIONS.ORDER_UPDATE_STATUS], formData, updateFulfilment);
  if (result.ok && formData.get("status") === "shipped") {
    const orderNumber = String(formData.get("orderNumber"));
    after(() => sendOrderShippedEmail(orderNumber));
  }
  return result;
}

export async function closeOrderAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  const result = await run([PERMISSIONS.ORDER_UPDATE_STATUS], formData, closeOrder);
  if (result.ok) {
    const orderNumber = String(formData.get("orderNumber"));
    after(() => sendOrderClosedEmail(orderNumber));
  }
  return result;
}

export async function addOrderNoteAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run([PERMISSIONS.ORDER_UPDATE_STATUS], formData, addOrderNote);
}

/** Permanent: only a cancelled or rejected order qualifies, checked again on the server. */
export async function deleteOrderAction(_state: StaffActionResult | null, formData: FormData): Promise<StaffActionResult> {
  return run([PERMISSIONS.ORDER_UPDATE_STATUS], formData, deleteOrder);
}
