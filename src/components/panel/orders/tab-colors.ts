import type { OrderTab } from "@/features/orders/transitions";
import type { PaymentStatus } from "@/features/orders/status";
import { PILL_COLORS } from "@/lib/pill-colors";

/** One colour per tab (C21/C22), readable in light and dark: dot, pill background and pill text. */
export const TAB_COLORS: Record<OrderTab, { dot: string; bg: string; text: string }> = {
  need_review: PILL_COLORS.amber,
  pending_delivery: PILL_COLORS.orange,
  processing: PILL_COLORS.blue,
  delivery: PILL_COLORS.purple,
  completed: PILL_COLORS.emerald,
  cancelled: PILL_COLORS.gray,
  rejected: PILL_COLORS.red,
};

/** The detail page's read-only payment pill, a separate colour scale from the status pill. */
export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, { bg: string; text: string }> = {
  unpaid: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
  proof_submitted: { bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-400" },
  verified: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
  rejected: { bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400" },
  cod_pending: { bg: "bg-blue-500/15", text: "text-blue-700 dark:text-blue-400" },
  cod_collected: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
};
