import "@/lib/zod-config";
import { z } from "zod";
import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";

// The panel's roles CRUD (S20, REQUIREMENTS §3.1 / DV-08): one Zod schema per form and the
// Server Action. The permission set is posted as one comma-separated `permissions` field (D50:
// the wire format is the contract); the rules that need other rows (members, the no-lock-out
// check, the sensitive-grant confirmation) live in `staff-service.ts`, under the lock.

const knownKeys = new Set<string>(Object.values(PERMISSIONS));

/** The posted `permissions` field: known keys only, de-duplicated, in `PERMISSIONS` order. */
export const permissionsField = z.string().max(5_000).transform((raw, ctx) => {
  const chosen = new Set<string>();
  for (const token of raw.split(",")) {
    const key = token.trim();
    if (key === "") continue;
    if (!knownKeys.has(key)) {
      ctx.addIssue({ code: "custom", message: `"${key}" isn't a known permission.` });
      return z.NEVER;
    }
    chosen.add(key);
  }
  return (Object.values(PERMISSIONS) as PermissionKey[]).filter((key) => chosen.has(key));
});

/** Lowercase letters, digits and single dashes, 2–50 characters: a stable identifier shown beside the name. */
export const ROLE_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const nameField = z.string().trim().min(2, "Enter a role name.").max(100, "Keep this under 100 characters.");
const versionField = z.string().min(1).max(100);
/** "true" once the editor confirmed the sensitive-grant warning dialog; absent or anything else otherwise. */
const confirmField = z.preprocess((value) => value === "true" || value === true, z.boolean());

export const createRoleInputSchema = z.object({
  name: nameField,
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Use at least 2 characters.")
    .max(50, "Keep this under 50 characters.")
    .regex(ROLE_KEY_PATTERN, "Use lowercase letters, numbers and single dashes only."),
  permissions: permissionsField,
});
export type CreateRoleInput = z.infer<typeof createRoleInputSchema>;

/** The per-role edit page: the key is fixed after creation; the name and the permission set change. */
export const updateRoleInputSchema = z.object({
  name: nameField,
  permissions: permissionsField,
  version: versionField,
  confirmSensitive: confirmField,
});
export type UpdateRoleInput = z.infer<typeof updateRoleInputSchema>;

/** The matrix page's per-column save: only the permission set (the name is edited on the role's own page). */
export const savePermissionsInputSchema = z.object({
  permissions: permissionsField,
  version: versionField,
  confirmSensitive: confirmField,
});
export type SavePermissionsInput = z.infer<typeof savePermissionsInputSchema>;

export const resetRoleInputSchema = z.object({
  version: versionField,
});

/** A role's key as a slug suggestion from its name, for the create form (pure). */
export function suggestRoleKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}
