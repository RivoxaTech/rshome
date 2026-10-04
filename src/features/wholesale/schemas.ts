import "@/lib/zod-config";
import { z } from "zod";
import { phoneSchema } from "@/features/checkout/schemas";
import { siteConfig } from "@/config/site.config";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, WHOLESALE_STATUSES } from "./transitions";
import { isValidIsoDate } from "@/lib/karachi-datetime";

// Matches `wholesale_inquiries.business_type` (DATABASE.md) — the DB truth, not the UI copy
// (`siteConfig.wholesaleBusinessTypes` holds the select's labels, kept in sync by hand).
const WHOLESALE_BUSINESS_TYPES = ["retail", "restaurant_cafe", "hotel", "event", "other"] as const;

/** Trimmed text that is stored as null when left empty (mirrors `features/checkout/schemas.ts`). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null));

/**
 * "Today" as `YYYY-MM-DD` in the shop's own timezone (`config/site.config.ts`), never the
 * runtime's local/UTC date — explicit `2-digit` month/day forces zero-padding regardless of ICU
 * default formatting, so the result always sorts correctly against another `YYYY-MM-DD` string.
 * Exported so the client (the date picker's `min`) and the server (this schema) always agree,
 * each computing it in its own runtime rather than one trusting the other's clock.
 */
export function todayInKarachi(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: siteConfig.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}


/** `""`/missing become `null`; otherwise a valid calendar date that hasn't already passed. */
const neededByDateSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isValidIsoDate(value), "Enter a valid date.")
  .refine((value) => value === null || value >= todayInKarachi(), "Choose a date that hasn't already passed.");

export const wholesaleItemSchema = z.object({
  itemName: z.string().trim().min(1, "Enter what you'd like.").max(200, "Keep this under 200 characters."),
  quantity: z.coerce.number().int("Enter a whole number.").min(1, "Enter a quantity.").max(100_000, "Enter a smaller quantity."),
  note: optionalText(255),
});

/**
 * The storefront wholesale form (REQUIREMENTS SF-08). `website` is the honeypot: hidden from
 * people and screen readers, so only a bot is ever likely to fill it; the service treats a
 * non-empty value as spam rather than a validation error (a real visitor should never see one).
 */
export const wholesaleInquiryInputSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(150, "Enter a shorter name."),
  business: optionalText(150),
  businessType: z.enum(WHOLESALE_BUSINESS_TYPES, { error: "Choose a business type." }),
  phone: phoneSchema,
  email: optionalText(191).pipe(z.email("Enter a valid email address.").nullable()),
  city: z.string().trim().min(2, "Enter your city.").max(100, "Enter a shorter city name."),
  neededByDate: neededByDateSchema,
  items: z.array(wholesaleItemSchema).min(1, "Add at least one item.").max(20, "Add up to 20 items."),
  message: z
    .string()
    .trim()
    .max(2000, "Keep your message under 2,000 characters.")
    .optional()
    .transform((value) => value ?? ""),
  website: z.string().trim().optional().default(""),
});

export type WholesaleInquiryInput = z.infer<typeof wholesaleInquiryInputSchema>;

// Next hands repeated query keys over as arrays (?q=a&q=b); only the first counts.
const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** The inbox's query string: the status (none is All), a search, the page and the page size. A bad value is dropped. */
export const wholesaleListQuerySchema = z.object({
  tab: z
    .preprocess(firstValue, z.string().optional())
    .transform((value) => (WHOLESALE_STATUSES as readonly string[]).includes(value ?? "") ? (value as (typeof WHOLESALE_STATUSES)[number]) : "all")
    .catch("all" as const),
  q: z.preprocess(firstValue, z.string().trim().max(100).optional()).catch(undefined),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
  pageSize: z
    .preprocess(firstValue, z.coerce.number().int())
    .refine((value): value is (typeof PAGE_SIZE_OPTIONS)[number] => (PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
    .catch(DEFAULT_PAGE_SIZE),
});

export type WholesaleListQuery = z.infer<typeof wholesaleListQuerySchema>;

/** The list the detail page was opened from, for its back link: only the wholesale inbox with its own query string. */
export const backHrefSchema = z
  .preprocess(firstValue, z.string().max(300).regex(/^\/panel\/wholesale(\?[\w=&%.+-]*)?$/).optional())
  .catch(undefined);

export const changeStatusSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(WHOLESALE_STATUSES, { error: "Choose a status." }),
});

export const addNoteSchema = z.object({
  id: z.coerce.number().int().positive(),
  note: z.string({ error: "Write the note first." }).trim().min(1, "Write the note first.").max(2000, "Keep the note under 2,000 characters."),
});
