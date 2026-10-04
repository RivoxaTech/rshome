/**
 * The panel's roles CRUD (S20, REQUIREMENTS §3.1 / DV-08, `role.manage`, Developer-only by
 * default). Every write locks the role row (`SELECT … FOR UPDATE`, one transaction), re-checks
 * its rules there and records an `audit_logs` row with the full before/after key list. Refusals
 * come back as `{ ok: false }`, never a throw.
 *
 * Owner decision (S20, amending C24): the permissions matrix is **dynamic**. Anyone with
 * `role.manage` may toggle any key on any role, the two system roles included — the code
 * defaults are only the first-run starting point, and the seed never revokes or re-grants a key
 * on an existing role (`features/auth/seed-roles.ts`). "Reset to defaults" restores the code set
 * for a system role on demand. System roles still can't be deleted (the seed and the users page
 * rely on them existing).
 *
 * Guard rails, all under the lock:
 * - No lock-out: `user.manage`/`role.manage` can't be removed from a role when no other *active*
 *   user holds that key through another role (this also means the Developer role can't lose
 *   `role.manage` while it's the only way to manage roles).
 * - A role with members can't be saved with zero permissions.
 * - A sensitive grant (a customer-data key to `developer`, a configuration key to `admin` —
 *   `features/auth/permissions.ts#sensitiveGrants`) needs the confirmed warning dialog's
 *   `confirmSensitive` flag, and is audited separately with the key list.
 * - A stale edit (the row changed since the page was opened) is refused through `version`.
 * - Saving a role deletes its members' sessions (the editor's own is kept), so the new set is
 *   applied through a fresh login — permissions are re-read from `role_id` on every request anyway,
 *   so the change would apply on their next click regardless.
 */
import { insertAuditLog } from "@/features/audit/repo";
import { ACCESS_CONTROL_PERMISSIONS } from "@/features/auth/permission-groups";
import { PERMISSION_DESCRIPTIONS, PERMISSIONS, SYSTEM_ROLE_DEFAULTS, sensitiveGrants, type PermissionKey } from "@/features/auth/permissions";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { deleteSessionsForUsers } from "@/features/users/staff-repo";
import { fingerprint } from "@/lib/fingerprint";
import { db, type DbClient } from "@/server/db/client";
import { createRoleInputSchema, resetRoleInputSchema, savePermissionsInputSchema, updateRoleInputSchema } from "./schemas";
import { isDuplicateEntry } from "@/server/db/errors";
import {
  countActiveHoldersOutsideRole,
  countMembers,
  deleteRole,
  getRoleById,
  insertRole,
  keyInUse,
  listRoles,
  lockRoleById,
  memberCountsByRole,
  memberIds,
  permissionKeysByRole,
  permissionKeysForRole,
  setRolePermissions,
  updateRole,
  type RoleRow,
} from "./staff-repo";
import { StaffActionError, invalidInput, refusal } from "@/features/shared/staff-result";

export type { StaffActionResult };

/** Who is editing: their id (for the audit row) and their own session (kept when their role is saved). */
type Actor = { id: number; sessionId: string | null };

const KEY_IN_USE = "Another role already uses this key.";
export const SYSTEM_ROLE_DELETE_MESSAGE = "This is a system role: the seed and the users page rely on it existing, so it can't be deleted. Change its permissions instead.";
export const STALE_ROLE_MESSAGE = "Someone else changed this role after you opened the page. Reload to see their changes, then make yours again.";
export const CONFIRM_SENSITIVE_MESSAGE = "This change gives the role access outside its side of the store. Confirm the warning to save it.";
const EMPTY_WITH_MEMBERS = "This role has users, so it must keep at least one permission.";

const ORDERED_KEYS = Object.values(PERMISSIONS) as PermissionKey[];
/** Keys in `PERMISSIONS` order, so two sets compare and audit identically whatever order they came in. */
const sortKeys = (keys: Iterable<PermissionKey>): PermissionKey[] => {
  const set = new Set(keys);
  return ORDERED_KEYS.filter((key) => set.has(key));
};

// ── Audit values and the version token ──────────────────────────────────────────────────────────

function auditValues(role: Pick<RoleRow, "key" | "name" | "isSystem">, keys: readonly PermissionKey[]) {
  return { key: role.key, name: role.name, isSystem: role.isSystem, permissions: sortKeys(keys) };
}

function roleVersion(role: Pick<RoleRow, "key" | "name" | "isSystem" | "updatedAt">, keys: readonly PermissionKey[]): string {
  return `${role.updatedAt.getTime()}@${fingerprint(auditValues(role, keys))}`;
}

/** `PERMISSION_DESCRIPTIONS` as plain data for the pages (the client components never import the server-side registry). */
export const PERMISSION_LABELS: Record<PermissionKey, string> = PERMISSION_DESCRIPTIONS;

// ── The matrix (and the list behind it) ─────────────────────────────────────────────────────────

export type StaffRoleColumn = {
  id: number;
  key: string;
  name: string;
  isSystem: boolean;
  memberCount: number;
  permissions: PermissionKey[];
  version: string;
  /** True when the role holds `user.manage` or `role.manage` (the page shows a small warning). */
  managesAccess: boolean;
};

export async function listRoleColumns(): Promise<StaffRoleColumn[]> {
  const [rows, keysByRole, members] = await Promise.all([listRoles(), permissionKeysByRole(), memberCountsByRole()]);
  return rows.map((row) => {
    const keys = sortKeys(keysByRole.get(row.id) ?? []);
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      isSystem: row.isSystem,
      memberCount: members.get(row.id) ?? 0,
      permissions: keys,
      version: roleVersion(row, keys),
      managesAccess: keys.some((key) => ACCESS_CONTROL_PERMISSIONS.includes(key)),
    };
  });
}

// ── The edit page ───────────────────────────────────────────────────────────────────────────────

type RoleEditFormData = {
  role: RoleRow;
  permissions: PermissionKey[];
  version: string;
  memberCount: number;
  /** The code defaults for a system role (what "Reset to defaults" restores), null for a custom role. */
  defaults: PermissionKey[] | null;
};

export async function getRoleForEdit(id: number): Promise<RoleEditFormData | null> {
  const role = await getRoleById(id);
  if (!role) return null;
  const [keys, members] = await Promise.all([permissionKeysForRole(id), countMembers(id)]);
  const defaults = role.isSystem ? (SYSTEM_ROLE_DEFAULTS[role.key]?.permissions ?? null) : null;
  return { role, permissions: sortKeys(keys), version: roleVersion(role, keys), memberCount: members, defaults: defaults ? sortKeys(defaults) : null };
}

// ── Shared rule checks ──────────────────────────────────────────────────────────────────────────

async function assertNoLockOut(tx: DbClient, roleId: number, current: readonly PermissionKey[], next: readonly PermissionKey[]): Promise<void> {
  for (const key of ACCESS_CONTROL_PERMISSIONS) {
    if (!current.includes(key) || next.includes(key)) continue;
    if ((await countActiveHoldersOutsideRole(key, roleId, tx)) === 0) {
      throw new StaffActionError(`"${key}" can't be removed: no other active user holds it, so nobody could manage ${key === PERMISSIONS.USER_MANAGE ? "users" : "roles"} any more.`, "permissions");
    }
  }
}

/**
 * The one write path for a role's permission set (the edit page, a matrix column, reset to
 * defaults): the rules above, the update, the audit rows, and the members' session revocation.
 */
async function writePermissions(
  tx: DbClient,
  current: RoleRow,
  currentKeys: PermissionKey[],
  input: { name: string; permissions: PermissionKey[]; version: string; confirmSensitive: boolean },
  actor: Actor,
  audit: { action: string; extra?: Record<string, unknown> },
): Promise<void> {
  if (roleVersion(current, currentKeys) !== input.version) throw new StaffActionError(STALE_ROLE_MESSAGE);
  const nextKeys = sortKeys(input.permissions);

  const members = await memberIds(current.id, tx);
  if (members.length > 0 && nextKeys.length === 0) throw new StaffActionError(EMPTY_WITH_MEMBERS, "permissions");
  await assertNoLockOut(tx, current.id, currentKeys, nextKeys);

  const sensitive = sensitiveGrants(current.key, currentKeys, nextKeys);
  if (sensitive.length > 0 && !input.confirmSensitive) throw new StaffActionError(CONFIRM_SENSITIVE_MESSAGE, "confirmSensitive");

  const now = new Date();
  await updateRole(tx, current.id, { name: input.name, updatedAt: now });
  await setRolePermissions(tx, current.id, nextKeys);
  await insertAuditLog(tx, {
    userId: actor.id,
    action: audit.action,
    entity: "role",
    entityId: current.id,
    oldValues: auditValues(current, currentKeys),
    newValues: { ...auditValues({ key: current.key, name: input.name, isSystem: current.isSystem }, nextKeys), ...audit.extra },
    createdAt: now,
  });
  if (sensitive.length > 0) {
    await insertAuditLog(tx, {
      userId: actor.id,
      action: "role.sensitive_grant",
      entity: "role",
      entityId: current.id,
      oldValues: null,
      newValues: { roleKey: current.key, granted: sensitive, confirmed: true },
      createdAt: now,
    });
  }
  // The members pick up the new set through a fresh login; the editor's own session stays.
  await deleteSessionsForUsers(tx, members, actor.sessionId);
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────────

export async function createRole(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = createRoleInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      if (await keyInUse(input.key, tx)) throw new StaffActionError(KEY_IN_USE, "key");
      const keys = sortKeys(input.permissions);

      const now = new Date();
      const id = await insertRole(tx, { key: input.key, name: input.name, isSystem: false, createdAt: now, updatedAt: now });
      await setRolePermissions(tx, id, keys);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "role.create",
        entity: "role",
        entityId: id,
        oldValues: null,
        newValues: auditValues({ key: input.key, name: input.name, isSystem: false }, keys),
        createdAt: now,
      });
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    if (isDuplicateEntry(error)) return { ok: false, error: KEY_IN_USE, fieldErrors: { key: KEY_IN_USE } };
    throw error;
  }
}

// ── Update (the edit page), save permissions (a matrix column), reset to defaults ───────────────

export async function updateRoleById(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = updateRoleInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const current = await lockRoleById(tx, id);
      if (!current) throw new StaffActionError("Role not found.");
      const currentKeys = sortKeys(await permissionKeysForRole(id, tx));
      await writePermissions(tx, current, currentKeys, input, actor, { action: "role.update" });
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}

export async function saveRolePermissions(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = savePermissionsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const current = await lockRoleById(tx, id);
      if (!current) throw new StaffActionError("Role not found.");
      const currentKeys = sortKeys(await permissionKeysForRole(id, tx));
      await writePermissions(tx, current, currentKeys, { ...input, name: current.name }, actor, { action: "role.update" });
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}

/** Restores a system role's code defaults (`SYSTEM_ROLE_DEFAULTS`); the same rules apply, so a reset can't lock anyone out either. */
export async function resetRoleToDefaults(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = resetRoleInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    await db.transaction(async (tx) => {
      const current = await lockRoleById(tx, id);
      if (!current) throw new StaffActionError("Role not found.");
      const defaults = current.isSystem ? SYSTEM_ROLE_DEFAULTS[current.key]?.permissions : undefined;
      if (!defaults) throw new StaffActionError("Only a system role has code defaults to reset to.");
      const currentKeys = sortKeys(await permissionKeysForRole(id, tx));
      // Resetting only ever moves a role back to its own side, so it's never a sensitive grant; the flag is set for form.
      await writePermissions(
        tx,
        current,
        currentKeys,
        { name: current.name, permissions: [...defaults], version: parsed.data.version, confirmSensitive: true },
        actor,
        { action: "role.reset_defaults", extra: { resetToDefaults: true } },
      );
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────

export type RoleDeleteGuard = { allowed: true } | { allowed: false; reason: string };

export async function checkRoleDeletable(id: number): Promise<RoleDeleteGuard> {
  const role = await getRoleById(id);
  if (!role) return { allowed: false, reason: "Role not found." };
  if (role.isSystem) return { allowed: false, reason: SYSTEM_ROLE_DELETE_MESSAGE };
  const members = await countMembers(id);
  if (members > 0) return { allowed: false, reason: `${members} ${members === 1 ? "user holds" : "users hold"} this role. Move them to another role first.` };
  return { allowed: true };
}

export async function deleteRoleById(id: number, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const current = await lockRoleById(tx, id);
      if (!current) throw new StaffActionError("Role not found.");
      if (current.isSystem) throw new StaffActionError(SYSTEM_ROLE_DELETE_MESSAGE);
      const members = await countMembers(id, tx);
      if (members > 0) throw new StaffActionError(`${members} ${members === 1 ? "user holds" : "users hold"} this role. Move them to another role first.`);

      const keys = await permissionKeysForRole(id, tx);
      const now = new Date();
      await deleteRole(tx, id);
      await insertAuditLog(tx, { userId: actor.id, action: "role.delete", entity: "role", entityId: id, oldValues: auditValues(current, keys), newValues: {}, createdAt: now });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}
