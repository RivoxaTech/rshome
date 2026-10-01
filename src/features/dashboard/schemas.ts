import { z } from "zod";
import { DEFAULT_RANGE, RANGE_KEYS } from "./ranges";

// Next hands repeated query keys over as arrays (?range=a&range=b); only the first counts.
const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** `/panel?range=...` — an unknown or missing value falls back to the default (C28). */
export const dashboardQuerySchema = z.object({
  range: z.preprocess(firstValue, z.enum(RANGE_KEYS)).catch(DEFAULT_RANGE),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
