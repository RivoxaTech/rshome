/**
 * The seed's permissions-and-roles step (S20, owner decision amending C24; ARCHITECTURE.md §4.5):
 * upserts every permission row from the code's `PERMISSIONS`, creates the two system roles if
 * missing, and grants a system role its code defaults **only when the role is first created** —
 * plus any brand-new permission key the run inserts into `permissions` for the first time, which
 * goes to whichever role's default list names it. It never revokes, and never re-grants a key the
 * panel removed: the live sets belong to `/panel/roles`. Lives here (not in scripts/) so the
 * integration tests can run exactly what the seed runs.
 */
import { eq } from "drizzle-orm";
import type { PermissionKey } from "@/features/auth/permissions";
import { grantRolePermissions } from "@/features/auth/repo";
import { db } from "@/server/db/client";
import { permissions as permissionsTable, roles } from "@/server/db/schema/access-control";

export type SeedRolesInput = {
  keys: readonly string[];
  descriptions: Record<string, string>;
  /** By role key: the display name used on creation and the first-run permission set. */
  defaults: Record<string, { name: string; permissions: readonly string[] }>;
};

export type SeedRolesResult = {
  newKeys: string[];
  createdRoles: string[];
  /** What each system role was actually granted this run (empty on a plain re-run). */
  granted: Record<string, string[]>;
};

export async function seedPermissionsAndRoles(input: SeedRolesInput): Promise<SeedRolesResult> {
  const existingKeys = new Set((await db.select({ key: permissionsTable.key }).from(permissionsTable)).map((row) => row.key));
  const newKeys: string[] = [];
  for (const key of input.keys) {
    if (existingKeys.has(key)) {
      await db.update(permissionsTable).set({ description: input.descriptions[key] ?? null }).where(eq(permissionsTable.key, key));
    } else {
      await db.insert(permissionsTable).values({ key, description: input.descriptions[key] ?? null });
      newKeys.push(key);
    }
  }

  const createdRoles: string[] = [];
  const granted: Record<string, string[]> = {};
  for (const [roleKey, defaults] of Object.entries(input.defaults)) {
    const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey));
    let roleId = existing?.id;
    let created = false;
    if (roleId === undefined) {
      const [inserted] = await db.insert(roles).values({ key: roleKey, name: defaults.name, isSystem: true });
      roleId = inserted.insertId;
      created = true;
      createdRoles.push(roleKey);
    } else {
      // Keep it a system role; the name is the panel's to change, so it's left alone.
      await db.update(roles).set({ isSystem: true }).where(eq(roles.id, roleId));
    }

    const toGrant = created ? defaults.permissions : defaults.permissions.filter((key) => newKeys.includes(key));
    granted[roleKey] = await grantRolePermissions(roleId, toGrant as PermissionKey[]);
  }

  return { newKeys, createdRoles, granted };
}
