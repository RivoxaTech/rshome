import { and, asc, count, desc, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";
import { db, type DbClient } from "@/server/db/client";
import { users } from "@/server/db/schema/access-control";
import { auditLogs } from "@/server/db/schema/audit";
import { wholesaleInquiries, wholesaleInquiryItems, wholesaleInquiryNotes } from "@/server/db/schema/wholesale";
import type { WholesaleStatus } from "./transitions";

export type InquiryUpdate = Partial<typeof wholesaleInquiries.$inferInsert>;

/** LIKE treats `%` and `_` as wildcards and `\` as its escape: a search is matched literally. */
const contains = (text: string) => `%${text.replace(/[%_]/g, "\\$&")}%`;

function searchCondition(text: string): SQL | undefined {
  const digits = text.replace(/\D/g, "");
  const phone = normalizePhone(text);
  return or(
    like(wholesaleInquiries.name, contains(text)),
    like(wholesaleInquiries.business, contains(text)),
    like(wholesaleInquiries.city, contains(text)),
    digits.length >= 4 ? like(wholesaleInquiries.phone, contains(digits)) : undefined,
    phone ? eq(wholesaleInquiries.phone, phone) : undefined,
  );
}

/**
 * One page of inquiries, in one status or all of them, and how many match in all. New sorts
 * oldest first (a work queue, matching the orders list's own Need review rule); every other tab
 * is newest first, since it's a record of what already happened.
 */
export async function listInquiries(
  status: WholesaleStatus | "all",
  search: string | undefined,
  page: { limit: number; offset: number },
) {
  const where = and(status === "all" ? undefined : eq(wholesaleInquiries.status, status), search ? searchCondition(search) : undefined);
  const order =
    status === "new"
      ? [asc(wholesaleInquiries.createdAt), asc(wholesaleInquiries.id)]
      : [desc(wholesaleInquiries.createdAt), desc(wholesaleInquiries.id)];
  const [rows, [total]] = await Promise.all([
    db.select().from(wholesaleInquiries).where(where).orderBy(...order).limit(page.limit).offset(page.offset),
    db.select({ count: count() }).from(wholesaleInquiries).where(where),
  ]);
  return { rows, total: total.count };
}

/** Every matching inquiry, capped at 5,000, for the CSV export — no pagination. */
export async function listInquiriesForExport(status: WholesaleStatus | "all", search: string | undefined) {
  const where = and(status === "all" ? undefined : eq(wholesaleInquiries.status, status), search ? searchCondition(search) : undefined);
  return db.select().from(wholesaleInquiries).where(where).orderBy(desc(wholesaleInquiries.createdAt)).limit(5000);
}

/** How many inquiries there are per status: a handful of rows at most. */
export async function countInquiriesByStatus(): Promise<Record<WholesaleStatus, number>> {
  const rows = await db.select({ status: wholesaleInquiries.status, count: count() }).from(wholesaleInquiries).groupBy(wholesaleInquiries.status);
  const counts = { new: 0, contacted: 0, closed: 0 } as Record<WholesaleStatus, number>;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export async function countItemsByInquiryIds(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ inquiryId: wholesaleInquiryItems.inquiryId, count: count() })
    .from(wholesaleInquiryItems)
    .where(inArray(wholesaleInquiryItems.inquiryId, ids))
    .groupBy(wholesaleInquiryItems.inquiryId);
  return new Map(rows.map((row) => [row.inquiryId, row.count]));
}

export async function getInquiryById(id: number) {
  const [row] = await db.select().from(wholesaleInquiries).where(eq(wholesaleInquiries.id, id));
  return row;
}

export async function getItemsByInquiryId(id: number) {
  return db.select().from(wholesaleInquiryItems).where(eq(wholesaleInquiryItems.inquiryId, id)).orderBy(asc(wholesaleInquiryItems.id));
}

export async function getItemsByInquiryIds(ids: number[]) {
  if (ids.length === 0) return [];
  return db.select().from(wholesaleInquiryItems).where(inArray(wholesaleInquiryItems.inquiryId, ids)).orderBy(asc(wholesaleInquiryItems.id));
}

/** `SELECT … FOR UPDATE` on the inquiry row: every staff action runs its checks under this lock. */
export async function lockInquiryById(tx: DbClient, id: number) {
  const [row] = await tx.select().from(wholesaleInquiries).where(eq(wholesaleInquiries.id, id)).for("update");
  return row;
}

export async function updateInquiry(tx: DbClient, id: number, values: InquiryUpdate): Promise<void> {
  await tx.update(wholesaleInquiries).set(values).where(eq(wholesaleInquiries.id, id));
}

export async function insertNote(tx: DbClient, values: { inquiryId: number; authorUserId: number; note: string; createdAt: Date }): Promise<void> {
  await tx.insert(wholesaleInquiryNotes).values(values);
}

/** Internal staff notes, newest first, with who wrote each one. */
export async function listNotes(inquiryId: number) {
  return db
    .select({ id: wholesaleInquiryNotes.id, note: wholesaleInquiryNotes.note, createdAt: wholesaleInquiryNotes.createdAt, authorName: users.name })
    .from(wholesaleInquiryNotes)
    .leftJoin(users, eq(users.id, wholesaleInquiryNotes.authorUserId))
    .where(eq(wholesaleInquiryNotes.inquiryId, inquiryId))
    .orderBy(desc(wholesaleInquiryNotes.createdAt), desc(wholesaleInquiryNotes.id));
}

/**
 * Status changes, newest first: read from `audit_logs` (`action = 'wholesale.status_change'`)
 * rather than a dedicated history table — the Activity timeline merges this with `listNotes`.
 */
export async function listStatusHistory(inquiryId: number) {
  return db
    .select({ id: auditLogs.id, oldValues: auditLogs.oldValues, newValues: auditLogs.newValues, createdAt: auditLogs.createdAt, authorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(eq(auditLogs.entity, "wholesale_inquiry"), eq(auditLogs.entityId, String(inquiryId)), eq(auditLogs.action, "wholesale.status_change")))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
}
