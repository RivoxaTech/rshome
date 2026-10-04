/**
 * What every panel write service returns (S22 QA-09: one definition instead of one per feature).
 * A success may carry a little extra (`id`, `orderNumber`); a refusal carries the message staff
 * see and, when it concerns one field, that field's error for the form.
 */
import type { z } from "zod";
import { fieldErrorsOf } from "@/lib/field-errors";

export type StaffFailure = { ok: false; error: string; fieldErrors?: Record<string, string> };

export type StaffResult<Ok extends object = object> = ({ ok: true } & Ok) | StaffFailure;

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
export class StaffActionError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** The refusal for input that failed its schema: the first message, plus one per field. */
export function invalidInput(error: z.ZodError): StaffFailure {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

/** The refusal for a `StaffActionError` thrown inside a write. */
export function refusal(error: StaffActionError): StaffFailure {
  return error.field ? { ok: false, error: error.message, fieldErrors: { [error.field]: error.message } } : { ok: false, error: error.message };
}
