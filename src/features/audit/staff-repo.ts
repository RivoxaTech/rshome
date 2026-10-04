/**
 * The audit viewer's reads (S20): DB access only. `repo.ts` stays the one writer every service
 * uses. Filters map straight onto the `(entity, entity_id)` and `created_at` indexes where they
 * can; `user_id` and `action` have none (the table is small on a store this size, DATABASE.md).
 */
import { and, count, desc, eq, gte, isNull, like, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema/access-control";
import { auditLogs } from "@/server/db/schema/audit";
import { likeContains } from "@/lib/sql-like";

export type AuditFilter = {
  /** A user id, "system" for rows with no acting user, or undefined for everyone. */
  user?: number | "system";
  action?: string;
  entity?: string;
  /** Matched as a contains search on `entity_id`. */
  entityId?: string;
  /** UTC instants: `from` inclusive, `to` exclusive. */
  from?: Date;
  to?: Date;
};

export type AuditRow = {
  id: number;
  userId: number | null;
  /** Null for a system row; a user with audit rows can't be deleted (S20), so an id always resolves. */
  userName: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldValues: string | null;
  newValues: string | null;
  createdAt: Date;
};

const contains = likeContains;

function whereFor(filter: AuditFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.user === "system") conditions.push(isNull(auditLogs.userId));
  else if (filter.user !== undefined) conditions.push(eq(auditLogs.userId, filter.user));
  if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
  if (filter.entity) conditions.push(eq(auditLogs.entity, filter.entity));
  if (filter.entityId) conditions.push(like(auditLogs.entityId, contains(filter.entityId)));
  if (filter.from) conditions.push(gte(auditLogs.createdAt, filter.from));
  if (filter.to) conditions.push(lt(auditLogs.createdAt, filter.to));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function countAuditRows(filter: AuditFilter): Promise<number> {
  const [row] = await db.select({ count: count() }).from(auditLogs).where(whereFor(filter));
  return row.count;
}

/** One page, newest first (`created_at`, then id, so two rows written in the same second keep a stable order). */
export function listAuditRows(filter: AuditFilter, page: number, pageSize: number): Promise<AuditRow[]> {
  return db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      userName: users.name,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      oldValues: auditLogs.oldValues,
      newValues: auditLogs.newValues,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(whereFor(filter))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

/** Every user (any status), for the actor filter's Listbox. */
export function listAuditActors(): Promise<{ id: number; name: string }[]> {
  return db.select({ id: users.id, name: users.name }).from(users).orderBy(sql`lower(${users.name})`, users.id);
}
