/**
 * What staff do to an inquiry from the panel (S17). The Server Actions check the permission;
 * every function here validates its input, locks the inquiry row, re-checks the move under that
 * lock, and records it — a status change in `audit_logs` (so the Activity timeline can read it
 * back alongside internal notes), a note in `wholesale_inquiry_notes` — in the same transaction.
 */
import type { z } from "zod";
import { insertAuditLog } from "@/features/audit/repo";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { db, type DbClient } from "@/server/db/client";
import { addNoteSchema, changeStatusSchema } from "./schemas";
import { insertNote, lockInquiryById, updateInquiry } from "./staff-repo";
import { STATUS_LABELS, canChangeStatus } from "./transitions";

export type StaffActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** The signed-in staff member, from `requirePermission`. */
type Actor = { id: number };
type LockedInquiry = NonNullable<Awaited<ReturnType<typeof lockInquiryById>>>;

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
class StaffActionError extends Error {}

function invalid(error: z.ZodError): StaffActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

async function withLockedInquiry(
  id: number,
  change: (tx: DbClient, inquiry: LockedInquiry, now: Date) => Promise<void>,
): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const inquiry = await lockInquiryById(tx, id);
      if (!inquiry) throw new StaffActionError("Inquiry not found.");
      await change(tx, inquiry, new Date());
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }
}

/** The status pill's popover. */
export async function changeWholesaleStatus(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = changeStatusSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  return withLockedInquiry(input.id, async (tx, inquiry, now) => {
    if (!canChangeStatus(inquiry.status, input.status)) {
      throw new StaffActionError(`This inquiry is already ${STATUS_LABELS[input.status]}.`);
    }
    await updateInquiry(tx, input.id, { status: input.status });
    await insertAuditLog(tx, {
      userId: actor.id,
      action: "wholesale.status_change",
      entity: "wholesale_inquiry",
      entityId: input.id,
      oldValues: { status: inquiry.status },
      newValues: { status: input.status },
      createdAt: now,
    });
  });
}

/** An internal note: staff-only, never shown to the customer. Needs `wholesale.manage`. */
export async function addWholesaleNote(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = addNoteSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  return withLockedInquiry(input.id, async (tx, _inquiry, now) => {
    await insertNote(tx, { inquiryId: input.id, authorUserId: actor.id, note: input.note, createdAt: now });
  });
}
