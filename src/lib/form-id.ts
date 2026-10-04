import { z } from "zod";

/** A row id as a hidden form field posts it: a positive integer, nothing else. */
const formIdSchema = z.coerce.number().int().positive();

/**
 * The id behind a panel quick action (S22 SEC-07): `null` for anything but a positive integer, so
 * the action answers "not found" instead of handing `NaN` to the database. The services re-check
 * the row exists under their own lock; this only keeps garbage out of the query.
 */
export function parseFormId(value: FormDataEntryValue | null): number | null {
  const parsed = formIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
