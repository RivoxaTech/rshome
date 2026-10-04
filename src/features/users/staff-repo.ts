/**
 * The panel's users CRUD (S20): DB access only, no business rules (ARCHITECTURE.md §2) —
 * `staff-service.ts` owns the self/last-manager/delete rules, session revocation and audit rows.
 * `features/auth/repo.ts` stays the login/session read path. `password_hash` is read here only
 * where a service needs it to verify or replace it; it is never selected into a list row.
 */
import { and, count, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { permissions, rolePermissions, roles, sessions, users } from "@/server/db/schema/access-control";
import { auditLogs } from "@/server/db/schema/audit";
import { pushSubscriptions } from "@/server/db/schema/notify";
import { orderStatusHistory, paymentProofs } from "@/server/db/schema/orders";
import { wholesaleInquiryNotes } from "@/server/db/schema/wholesale";

/** A user row without its password hash — the shape every page and audit row works from. */
export type UserStaffRow = {
  id: number;
  name: string;
  email: string;
  roleId: number;
  roleKey: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const staffColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  roleId: users.roleId,
  roleKey: roles.key,
  roleName: roles.name,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

/** LIKE treats `%` and `_` as wildcards and `\` as its escape: a search is matched literally. */
const contains = (text: string) => `%${text.replace(/[%_\\]/g, "\\$&")}%`;

const searchWhere = (search?: string) => (search ? or(like(users.name, contains(search)), like(users.email, contains(search))) : undefined);

export async function countUsers(search?: string): Promise<number> {
  const [row] = await db.select({ count: count() }).from(users).where(searchWhere(search));
  return row.count;
}

/** One page, newest first. */
export function listUsersPage(search: string | undefined, page: number, pageSize: number): Promise<UserStaffRow[]> {
  return db
    .select(staffColumns)
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(searchWhere(search))
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

export async function getUserStaffRow(id: number, client: DbClient = db): Promise<UserStaffRow | undefined> {
  const [row] = await client.select(staffColumns).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, id));
  return row;
}

/** `SELECT … FOR UPDATE` on the user row (the role is read after, unlocked): every staff write runs its checks under this lock. */
export async function lockUserById(tx: DbClient, id: number): Promise<UserStaffRow | undefined> {
  const [locked] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).for("update");
  if (!locked) return undefined;
  return getUserStaffRow(id, tx);
}

/** True when another user (not `excludeId`) already has this normalised email. */
export async function emailInUse(email: string, excludeId?: number, client: DbClient = db): Promise<boolean> {
  const where = excludeId ? and(eq(users.email, email), ne(users.id, excludeId)) : eq(users.email, email);
  const [row] = await client.select({ id: users.id }).from(users).where(where).limit(1);
  return !!row;
}

export async function insertUser(tx: DbClient, values: typeof users.$inferInsert): Promise<number> {
  const [result] = await tx.insert(users).values(values);
  return result.insertId;
}

export async function updateUser(tx: DbClient, id: number, values: Partial<typeof users.$inferInsert>): Promise<void> {
  await tx.update(users).set(values).where(eq(users.id, id));
}

export async function deleteUser(tx: DbClient, id: number): Promise<void> {
  await tx.delete(users).where(eq(users.id, id));
}

export async function deleteAllSessions(tx: DbClient, userId: number): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteSessionsForUsers(tx: DbClient, userIds: number[], keepSessionId: string | null): Promise<void> {
  if (userIds.length === 0) return;
  await tx.delete(sessions).where(keepSessionId ? and(inArray(sessions.userId, userIds), ne(sessions.id, keepSessionId)) : inArray(sessions.userId, userIds));
}

// ── Rules' inputs ───────────────────────────────────────────────────────────────────────────────

/** Role ids whose permission set includes `permissionKey`. */
export async function roleIdsHolding(permissionKey: string, client: DbClient = db): Promise<number[]> {
  const rows = await client
    .select({ roleId: rolePermissions.roleId })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(permissions.key, permissionKey));
  return rows.map((row) => row.roleId);
}

/** Active users, other than `excludeUserId`, whose role is one of `roleIds`. */
export async function countActiveUsersInRoles(roleIds: number[], excludeUserId: number | null, client: DbClient = db): Promise<number> {
  if (roleIds.length === 0) return 0;
  const conditions = [eq(users.isActive, true), inArray(users.roleId, roleIds)];
  if (excludeUserId !== null) conditions.push(ne(users.id, excludeUserId));
  const [row] = await client.select({ count: count() }).from(users).where(and(...conditions));
  return row.count;
}

export type UserReferenceCounts = { sessions: number; auditRows: number; orderHistory: number; proofReviews: number; wholesaleNotes: number; pushSubscriptions: number };

/** Everything that points at a user through a foreign key — a user with any of these can only be deactivated, never deleted. */
export async function countUserReferences(userId: number, client: DbClient = db): Promise<UserReferenceCounts> {
  const one = async (query: Promise<{ count: number }[]>) => (await query)[0].count;
  const [sessionCount, auditCount, historyCount, proofCount, noteCount, pushCount] = await Promise.all([
    one(client.select({ count: count() }).from(sessions).where(eq(sessions.userId, userId))),
    one(client.select({ count: count() }).from(auditLogs).where(eq(auditLogs.userId, userId))),
    one(client.select({ count: count() }).from(orderStatusHistory).where(eq(orderStatusHistory.changedBy, userId))),
    one(client.select({ count: count() }).from(paymentProofs).where(eq(paymentProofs.reviewedBy, userId))),
    one(client.select({ count: count() }).from(wholesaleInquiryNotes).where(eq(wholesaleInquiryNotes.authorUserId, userId))),
    one(client.select({ count: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))),
  ]);
  return { sessions: sessionCount, auditRows: auditCount, orderHistory: historyCount, proofReviews: proofCount, wholesaleNotes: noteCount, pushSubscriptions: pushCount };
}

/** Every role, for the form's Listbox, system roles first then by name. */
export function listRoleOptions(client: DbClient = db): Promise<{ id: number; key: string; name: string; isSystem: boolean }[]> {
  return client
    .select({ id: roles.id, key: roles.key, name: roles.name, isSystem: roles.isSystem })
    .from(roles)
    .orderBy(desc(roles.isSystem), sql`lower(${roles.name})`, roles.id);
}
