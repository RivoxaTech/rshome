import "@/lib/zod-config";
import { z } from "zod";

// The panel's users CRUD (S20, REQUIREMENTS DV-08): one Zod schema per form, shared by the form
// (field errors as the Developer types) and the Server Action (the only check that matters).
// The row-level rules (self, last manager, sessions) need the rows, so `staff-service.ts`
// checks them under the row lock; these pin the shape.

const activeField = z.preprocess((value) => value === "true" || value === true, z.boolean());

/** Same strength rule as the self-service change-password schema (`features/auth/service.ts`): at least 8 characters. */
export const MIN_PASSWORD_LENGTH = 8;
const passwordField = z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200, "Keep this under 200 characters.");

const nameField = z.string().trim().min(2, "Enter the person's name.").max(150, "Keep this under 150 characters.");
/** Trimmed and lower-cased, so uniqueness is case-insensitive whatever the index's collation does. */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(191, "Keep this under 191 characters.")
  .pipe(z.email("Enter a valid email address."));
const roleIdField = z.coerce.number({ error: "Choose a role." }).int().min(1, "Choose a role.");

export const createUserInputSchema = z.object({
  name: nameField,
  email: emailField,
  roleId: roleIdField,
  isActive: activeField,
  password: passwordField,
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  name: nameField,
  email: emailField,
  roleId: roleIdField,
  isActive: activeField,
  /** The optimistic-concurrency token the edit page handed down (`updated_at` + fingerprint). */
  version: z.string().min(1).max(100),
});
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const resetPasswordInputSchema = z.object({
  password: passwordField,
});

// ── The list ────────────────────────────────────────────────────────────────────────────────────

const firstQueryValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const USER_PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
export const USER_DEFAULT_PAGE_SIZE: (typeof USER_PAGE_SIZE_OPTIONS)[number] = 25;

export const userListQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, z.string().trim().max(100).optional()).catch(undefined),
  page: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
  pageSize: z
    .preprocess(firstQueryValue, z.coerce.number().int())
    .refine((value): value is (typeof USER_PAGE_SIZE_OPTIONS)[number] => (USER_PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
    .catch(USER_DEFAULT_PAGE_SIZE),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

/** The list the create/edit page was opened from, for its back link: only the users list with its own query string. */
export const userBackHrefSchema = z.preprocess(firstQueryValue, z.string().max(300).regex(/^\/panel\/users(\?[\w=&%.+-]*)?$/).optional()).catch(undefined);
