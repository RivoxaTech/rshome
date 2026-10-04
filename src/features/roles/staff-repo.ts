/**
 * The panel's roles CRUD (S20): DB access only, no business rules (ARCHITECTURE.md §2) —
 * `staff-service.ts` owns the member, no-lock-out and sensitive-grant rules, session revocation
 * and audit rows. `features/auth/seed-roles.ts` is the seed's (grant-only) path for the two
 * system roles.
 */
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { PermissionKey } from "@/features/auth/permissions";
import { db, type DbClient } from "@/server/db/client";
import { permissions, rolePermissions, roles, users } from "@/server/db/schema/access-control";

export type RoleRow = typeof roles.$inferSelect;

/** Every role, system roles first then by name. */
export function listRoles(client: DbClient = db): Promise<RoleRow[]> {
  return client
    .select()
    .from(roles)
    .orderBy(desc(roles.isSystem), sql`lower(${roles.name})`, roles.id);
}

export async function getRoleById(id: number, client: DbClient = db): Promise<RoleRow | undefined> {
  const [row] = await client.select().from(roles).where(eq(roles.id, id));
  return row;
}

/** `SELECT … FOR UPDATE` on the role row: every staff write runs its checks under this lock. */
export async function lockRoleById(tx: DbClient, id: number): Promise<RoleRow | undefined> {
  const [row] = await tx.select().from(roles).where(eq(roles.id, id)).for("update");
  return row;
}

export async function keyInUse(key: string, client: DbClient = db): Promise<boolean> {
  const [row] = await client.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  return !!row;
}

export async function insertRole(tx: DbClient, values: typeof roles.$inferInsert): Promise<number> {
  const [result] = await tx.insert(roles).values(values);
  return result.insertId;
}

export async function updateRole(tx: DbClient, id: number, values: Partial<typeof roles.$inferInsert>): Promise<void> {
  await tx.update(roles).set(values).where(eq(roles.id, id));
}

export async function deleteRole(tx: DbClient, id: number): Promise<void> {
  await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
  await tx.delete(roles).where(eq(roles.id, id));
}

// ── Permission sets ─────────────────────────────────────────────────────────────────────────────

/** Permission keys per role id, in one query, for the list. */
export async function permissionKeysByRole(client: DbClient = db): Promise<Map<number, PermissionKey[]>> {
  const rows = await client
    .select({ roleId: rolePermissions.roleId, key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId));
  const map = new Map<number, PermissionKey[]>();
  for (const row of rows) {
    const list = map.get(row.roleId) ?? [];
    list.push(row.key as PermissionKey);
    map.set(row.roleId, list);
  }
  return map;
}

export async function permissionKeysForRole(roleId: number, client: DbClient = db): Promise<PermissionKey[]> {
  const rows = await client
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((row) => row.key as PermissionKey);
}

/** Replaces the role's grants with exactly `keys` (each must already exist in `permissions` — the seed creates every key). */
export async function setRolePermissions(tx: DbClient, roleId: number, keys: PermissionKey[]): Promise<void> {
  const current = await permissionKeysForRole(roleId, tx);
  const wanted = new Set(keys);
  const toRevoke = current.filter((key) => !wanted.has(key));
  const toGrant = keys.filter((key) => !current.includes(key));

  if (toRevoke.length > 0) {
    const rows = await tx.select({ id: permissions.id }).from(permissions).where(inArray(permissions.key, toRevoke));
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) await tx.delete(rolePermissions).where(and(eq(rolePermissions.roleId, roleId), inArray(rolePermissions.permissionId, ids)));
  }
  if (toGrant.length > 0) {
    const rows = await tx.select({ id: permissions.id }).from(permissions).where(inArray(permissions.key, toGrant));
    if (rows.length > 0) await tx.insert(rolePermissions).values(rows.map((row) => ({ roleId, permissionId: row.id })));
  }
}

// ── Members ─────────────────────────────────────────────────────────────────────────────────────

/** Users per role id (any status), in one query, for the list's member counts. */
export async function memberCountsByRole(client: DbClient = db): Promise<Map<number, number>> {
  const rows = await client.select({ roleId: users.roleId, count: count() }).from(users).groupBy(users.roleId);
  return new Map(rows.map((row) => [row.roleId, row.count]));
}

export async function countMembers(roleId: number, client: DbClient = db): Promise<number> {
  const [row] = await client.select({ count: count() }).from(users).where(eq(users.roleId, roleId));
  return row.count;
}

export async function memberIds(roleId: number, client: DbClient = db): Promise<number[]> {
  const rows = await client.select({ id: users.id }).from(users).where(eq(users.roleId, roleId));
  return rows.map((row) => row.id);
}

/** Active users whose role (other than `excludeRoleId`) holds `permissionKey`. */
export async function countActiveHoldersOutsideRole(permissionKey: string, excludeRoleId: number, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ count: count() })
    .from(users)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, users.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(users.isActive, true), eq(permissions.key, permissionKey), sql`${users.roleId} <> ${excludeRoleId}`));
  return row.count;
}
