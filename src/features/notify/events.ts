import type { PaymentMethod } from "@/features/orders/status";
import { env } from "@/server/env";

/**
 * The three events S21 notifies on (BUILD_PLAN.md C26, ARCHITECTURE.md §4.2 step 10).
 * `new_wholesale_inquiry` carries the new inquiry's id (S17 follow-up) so its tag and URL are
 * unique per inquiry — a constant tag made Chrome silently replace an earlier wholesale
 * notification instead of showing a new one.
 */
export type NotifyEvent =
  | { type: "new_order"; orderNumber: string; paymentMethod: PaymentMethod }
  | { type: "delivery_screenshot_uploaded"; orderNumber: string }
  | { type: "new_wholesale_inquiry"; inquiryId: number };

type PushPayload = { title: string; body: string; url: string; tag: string };

const NEW_ORDER_TITLES: Record<PaymentMethod, string> = {
  bank_transfer: "New bank transfer order",
  cod: "New COD order",
};

function panelUrl(path: string): string {
  return new URL(path, env.APP_URL).toString();
}

/** `/panel/orders/bank/[orderNumber]` or `/panel/orders/cod/[orderNumber]` (ARCHITECTURE.md §4.3). */
function orderDetailUrl(paymentMethod: PaymentMethod, orderNumber: string): string {
  const slug = paymentMethod === "bank_transfer" ? "bank" : "cod";
  return panelUrl(`/panel/orders/${slug}/${orderNumber}`);
}

/**
 * What a push notification says for each event (BUILD_PLAN.md S21): only the event, the order
 * number (or nothing, for a wholesale inquiry) and a link — never a customer name, phone, address,
 * email or amount. Pure, unit-tested.
 */
export function buildPushPayload(event: NotifyEvent): PushPayload {
  switch (event.type) {
    case "new_order":
      return {
        title: NEW_ORDER_TITLES[event.paymentMethod],
        body: event.orderNumber,
        url: orderDetailUrl(event.paymentMethod, event.orderNumber),
        tag: `order-${event.orderNumber}`,
      };
    case "delivery_screenshot_uploaded":
      // Only a bank-transfer order ever takes a second (delivery-charge) screenshot.
      return {
        title: "Delivery charge screenshot uploaded",
        body: event.orderNumber,
        url: orderDetailUrl("bank_transfer", event.orderNumber),
        tag: `order-${event.orderNumber}`,
      };
    case "new_wholesale_inquiry":
      return {
        title: "New wholesale inquiry",
        body: "",
        url: panelUrl(`/panel/wholesale/${event.inquiryId}`),
        tag: `wholesale-${event.inquiryId}`,
      };
  }
}
