import { z } from "zod";
import { SHOP_SORTS } from "./listing";

// Next hands repeated query keys over as arrays (?sort=a&sort=b); only the first counts.
const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** Shop/category query string. A bad value falls back to its default instead of erroring. */
export const listingQuerySchema = z.object({
  q: z.preprocess(firstValue, z.string().trim().max(100).optional()).catch(undefined),
  category: z.preprocess(firstValue, z.string().max(191).optional()).catch(undefined),
  sort: z.preprocess(firstValue, z.enum(SHOP_SORTS)).catch("newest"),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

export type ListingQuery = z.infer<typeof listingQuerySchema>;

export const slugSchema = z.string().min(1).max(191);

/** product_variants.attributes, e.g. {"Colour":"Red","Size":"Large"} (DATABASE.md DB2). */
export const variantAttributesSchema = z.record(z.string(), z.string());
