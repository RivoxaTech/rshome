import "@/lib/zod-config";
import { z } from "zod";
import { orderNumberSchema } from "@/features/checkout/schemas";
import { ORDER_TABS, TAB_INFO } from "./transitions";
import { pageSizeField } from "@/features/shared/pagination";

// Next hands repeated query keys over as arrays (?q=a&q=b); only the first counts.
const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/**
 * An orders page's query string (C21): the tab (by its slug; none is All), a search, the page and
 * the page size. A bad value is dropped. The page itself drops a tab its payment method doesn't have.
 */
export const orderListQuerySchema = z.object({
  tab: z
    .preprocess(firstValue, z.string().optional())
    .transform((slug) => ORDER_TABS.find((tab) => TAB_INFO[tab].slug === slug) ?? "all")
    .catch("all" as const),
  q: z.preprocess(firstValue, z.string().trim().max(100).optional()).catch(undefined),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
  pageSize: pageSizeField,
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/**
 * The list a detail page was opened from, for its back link: only an orders page with its own
 * query string, never another site or page.
 */
export const backHrefSchema = z.preprocess(
  firstValue,
  z
    .string()
    .max(300)
    .regex(/^\/panel\/orders\/(bank|cod)(\?[\w=&%.+-]*)?$/)
    .optional(),
).catch(undefined);

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => value || null);

const reason = z.string({ error: "Enter a reason." }).trim().min(1, "Enter a reason.").max(500, "Keep the reason under 500 characters.");

/** "Approve order": the delivery charge in whole rupees (C3), 0 allowed, with or without separators. */
export const approveOrderSchema = z.object({
  orderNumber: orderNumberSchema,
  amount: z
    .string({ error: "Enter the delivery charge first." })
    .trim()
    .transform((value) => value.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d{1,7}$/, "Enter the delivery charge in whole rupees, e.g. 450 (or 0).")),
  note: optionalText(255, "Keep the note under 255 characters."),
});

export const reviewProofSchema = z.discriminatedUnion("decision", [
  z.object({ proofId: z.coerce.number().int().positive(), decision: z.literal("approve") }),
  z.object({ proofId: z.coerce.number().int().positive(), decision: z.literal("reject"), reason }),
]);

/** The fulfilment dropdown: forward moves only, courier and tracking note optional. */
export const fulfilmentSchema = z.object({
  orderNumber: orderNumberSchema,
  status: z.enum(["shipped", "delivered"], { error: "Choose the new status." }),
  courier: optionalText(100, "Keep the courier under 100 characters."),
  trackingNote: optionalText(255, "Keep the tracking note under 255 characters."),
});

export const closeOrderSchema = z.object({
  orderNumber: orderNumberSchema,
  action: z.enum(["reject", "cancel"]),
  reason,
});

export const orderNoteSchema = z.object({
  orderNumber: orderNumberSchema,
  note: z.string({ error: "Write the note first." }).trim().min(1, "Write the note first.").max(2000, "Keep the note under 2,000 characters."),
});

/** Permanently deletes a closed order (owner decision, S9 follow-up); no reason needed, nothing left to tell the customer. */
export const deleteOrderSchema = z.object({ orderNumber: orderNumberSchema });
