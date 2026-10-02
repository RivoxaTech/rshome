/**
 * The one "no dates in the past" rule for discounts and coupons (owner decision, S12/S13 hands-on
 * check). Pure: plain instants in, field errors out, `now` injected so tests are deterministic.
 *
 * - On create (no `previous`), a start must not be in the past — with a 5-minute tolerance, so
 *   "now" typed into a minute-rounded `datetime-local` field isn't refused — and an end must be
 *   in the future. Blank bounds are always allowed.
 * - On edit, only a bound the Developer actually *changed* (compared as UTC instants with the
 *   stored row) is checked: a live or expired discount's past start never blocks saving other
 *   fields. "End after start" is the Zod schema's own check (`checkDateOrder`), not repeated here.
 * - `allowPastDates` skips the rule entirely: for `scripts/seed-demo-promotions.ts` and tests that
 *   need an already-started or expired fixture. The Server Actions never pass it.
 */

export const START_TOLERANCE_MS = 5 * 60 * 1000;

export const START_IN_PAST_MESSAGE = "Choose a start in the future.";
export const END_IN_PAST_MESSAGE = "The end must be in the future.";

export type DateWindow = { startsAt: Date | null; endsAt: Date | null };
export type DateWindowError = { field: "startsAt" | "endsAt"; message: string };

const sameInstant = (a: Date | null, b: Date | null) => (a === null ? b === null : b !== null && a.getTime() === b.getTime());

export function checkDateWindow(
  input: DateWindow,
  options: { previous: DateWindow | null; now: Date; allowPastDates?: boolean },
): DateWindowError[] {
  if (options.allowPastDates) return [];
  const errors: DateWindowError[] = [];
  const nowMs = options.now.getTime();

  const startChanged = options.previous === null || !sameInstant(input.startsAt, options.previous.startsAt);
  if (startChanged && input.startsAt && input.startsAt.getTime() < nowMs - START_TOLERANCE_MS) {
    errors.push({ field: "startsAt", message: START_IN_PAST_MESSAGE });
  }

  const endChanged = options.previous === null || !sameInstant(input.endsAt, options.previous.endsAt);
  if (endChanged && input.endsAt && input.endsAt.getTime() <= nowMs) {
    errors.push({ field: "endsAt", message: END_IN_PAST_MESSAGE });
  }

  return errors;
}

/**
 * The `min` for a `datetime-local` field: the current Karachi time on create, and on edit only
 * while the stored value is blank or still in the future — a `min` above an unchanged past value
 * would make the browser block the save. Both values are "YYYY-MM-DDTHH:mm" strings, which sort
 * correctly as text.
 */
export function dateInputMin(storedValue: string, nowLocal: string): string | undefined {
  return storedValue === "" || storedValue >= nowLocal ? nowLocal : undefined;
}

/** The first error per field, in the shape the forms read (`fieldErrors`). */
export function dateWindowFieldErrors(errors: DateWindowError[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const error of errors) if (!(error.field in fieldErrors)) fieldErrors[error.field] = error.message;
  return fieldErrors;
}
