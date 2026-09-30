import type { OrderTab } from "@/features/orders/transitions";
import type { PaymentStatus } from "@/features/orders/status";

/** One colour per tab (C21/C22), readable in light and dark: dot, pill background and pill text. */
export const TAB_COLORS: Record<OrderTab, { dot: string; bg: string; text: string }> = {
  need_review: { dot: "bg-amber-500", bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
  pending_delivery: { dot: "bg-orange-500", bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-400" },
  processing: { dot: "bg-blue-500", bg: "bg-blue-500/15", text: "text-blue-700 dark:text-blue-400" },
  delivery: { dot: "bg-purple-500", bg: "bg-purple-500/15", text: "text-purple-700 dark:text-purple-400" },
  completed: { dot: "bg-emerald-500", bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
  cancelled: { dot: "bg-gray-400", bg: "bg-gray-400/15", text: "text-gray-600 dark:text-gray-400" },
  rejected: { dot: "bg-red-500", bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400" },
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
