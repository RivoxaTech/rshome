import type { StatusAction } from "@/features/orders/transitions";

/**
 * Which dialog a row has open: a status action, "close" for the trash icon's cancel/reject
 * chooser, or "delete" for the trash icon's permanent-delete confirmation on a closed order.
 */
export type OpenDialog = StatusAction | "close" | "delete" | null;
