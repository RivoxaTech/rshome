import type { StatusAction } from "@/features/orders/transitions";

/** Shared between the list's status popover and the detail page's primary button/⋮ menu. */
export const ACTION_LABELS: Record<StatusAction, string> = {
  approve: "Approve order",
  check_screenshot: "Check screenshot",
  approve_whatsapp: "Approve order (paid via WhatsApp)",
  ship: "Move to Delivery",
  complete: "Mark completed",
  cancel: "Cancel order",
  reject: "Reject order",
};
