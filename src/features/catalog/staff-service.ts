/**
 * The panel's categories CRUD (S10, BUILD_PLAN.md owner decisions C24/C27, DATABASE.md
 * `categories`). Every write locks the row(s) it touches (`SELECT … FOR UPDATE`, mirroring
 * `features/wholesale/staff-actions.ts`) and records an `audit_logs` row (CLAUDE.md #10). One
 * level of nesting only: a category with a parent can't itself be a parent, and a category with
 * children can't be given one (owner decision, S10 follow-up).
 */
import type { z } from "zod";
import { insertAuditLog } from "@/features/audit/repo";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { deleteMediaImage } from "@/server/storage/images";
import { db, type DbClient } from "@/server/db/client";
import { categoryInputSchema, type CategoryInput } from "./schemas";
import { isDuplicateEntry } from "@/server/db/errors";
import {
  countChildren,
  countProductsByCategoryId,
  countProductsByCategoryIds,
  deleteCategory,
  getCategoryById,
  insertCategory,
  listAllCategoriesForStaff,
  listCategoriesPage,
  lockCategoryById,
  slugInUse,
  updateCategory,
  type CategoryRow,
} from "./staff-repo";

export type StaffActionResult = { ok: true; id?: number } | { ok: false; error: string; fieldErrors?: Record<string, string> };

type Actor = { id: number };

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
class CategoryActionError extends Error {}

function invalid(error: z.ZodError): StaffActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

// ── The list ────────────────────────────────────────────────────────────────────────────────

export type StaffCategoryListItem = {
  serial: number;
  id: number;
  name: string;
  slug: string;
  imagePath: string | null;
  parentName: string | null;
  productCount: number;
  sortOrder: number;
  isActive: boolean;
};

export async function listStaffCategories(query: {
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: StaffCategoryListItem[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const offset = (query.page - 1) * query.pageSize;
  const [{ rows, total }, allCategories] = await Promise.all([
    listCategoriesPage(query.q, { limit: query.pageSize, offset }),
    listAllCategoriesForStaff(),
  ]);
  const nameById = new Map(allCategories.map((category) => [category.id, category.name]));
  const productCounts = await countProductsByCategoryIds(rows.map((row) => row.id));

  const items = rows.map((row, index) => ({
    serial: offset + index + 1,
    id: row.id,
    name: row.name,
    slug: row.slug,
    imagePath: row.imagePath,
    parentName: row.parentId !== null ? (nameById.get(row.parentId) ?? null) : null,
    productCount: productCounts.get(row.id) ?? 0,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }));

  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

// ── The create/edit form ────────────────────────────────────────────────────────────────────

export type ParentOption = { id: number; name: string };

/** Top-level categories only, excluding the one being edited (a category can't be its own parent). */
async function getParentOptions(excludeId?: number): Promise<ParentOption[]> {
  const all = await listAllCategoriesForStaff();
  return all.filter((category) => category.parentId === null && category.id !== excludeId).map((category) => ({ id: category.id, name: category.name }));
}

type CategoryEditFormData = {
  category: CategoryRow;
  parentOptions: ParentOption[];
  /** The category currently has sub-categories, so it can't be given a parent itself. */
  hasChildren: boolean;
};

export async function getCategoryForEdit(id: number): Promise<CategoryEditFormData | null> {
  const category = await getCategoryById(id);
  if (!category) return null;
  const [parentOptions, childrenCount] = await Promise.all([getParentOptions(id), countChildren(id)]);
  return { category, parentOptions, hasChildren: childrenCount > 0 };
}

export async function getCategoryFormDataForCreate(): Promise<{ parentOptions: ParentOption[] }> {
  return { parentOptions: await getParentOptions() };
}

// ── Shared validation ───────────────────────────────────────────────────────────────────────

/**
 * Parent-related rules that no single column constraint can express. Throws `CategoryActionError`
 * (caught by the caller, inside the transaction) on the first violation.
 */
async function assertParentRules(tx: DbClient, input: CategoryInput, options: { selfId?: number; hasChildren: boolean }): Promise<void> {
  if (input.parentId === null) return;

  if (options.selfId !== undefined && input.parentId === options.selfId) {
    throw new CategoryActionError("A category can't be its own parent.");
  }
  if (options.hasChildren) {
    throw new CategoryActionError("This category has sub-categories, so it can't be given a parent. Move or delete them first.");
  }
  const parent = await getCategoryById(input.parentId, tx);
  if (!parent) {
    throw new CategoryActionError("Choose a valid parent category.");
  }
  if (parent.parentId !== null) {
    throw new CategoryActionError("That category already has a parent, so it can't be a parent itself (one level of nesting only).");
  }
}

async function assertSlugAvailable(slug: string, excludeId?: number): Promise<void> {
  if (await slugInUse(slug, excludeId)) {
    throw new CategoryActionError("That slug is already in use. Choose another.");
  }
}

type CategoryAuditFields = Pick<CategoryRow, "name" | "slug" | "description" | "imagePath" | "sortOrder" | "isActive" | "parentId">;

function auditValues(category: CategoryAuditFields) {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    imagePath: category.imagePath,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    parentId: category.parentId,
  };
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────

export async function createCategory(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = categoryInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      await assertSlugAvailable(input.slug);
      await assertParentRules(tx, input, { hasChildren: false });

      const now = new Date();
      const id = await insertCategory(tx, {
        name: input.name,
        slug: input.slug,
        description: input.description,
        imagePath: input.imagePath,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        parentId: input.parentId,
        createdAt: now,
        updatedAt: now,
      });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "category.create",
        entity: "category",
        entityId: id,
        oldValues: null,
        newValues: auditValues(input),
        createdAt: now,
      });
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof CategoryActionError) return { ok: false, error: error.message, fieldErrors: fieldErrorFor(error.message) };
    if (isDuplicateEntry(error)) return { ok: false, error: "That slug is already in use. Choose another.", fieldErrors: { slug: "Already in use." } };
    throw error;
  }
}

/** Maps a known refusal message to the field it's about, so the form highlights the right input. */
function fieldErrorFor(message: string): Record<string, string> | undefined {
  if (message.includes("slug")) return { slug: message };
  if (message.toLowerCase().includes("parent")) return { parentId: message };
  return undefined;
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────

export async function updateCategoryById(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = categoryInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  let replacedImagePath: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const category = await lockCategoryById(tx, id);
      if (!category) throw new CategoryActionError("Category not found.");

      await assertSlugAvailable(input.slug, id);
      // Read inside the locked transaction, so two concurrent edits can't build two-level nesting (S22 BUG-27).
      const childrenCount = await countChildren(id, tx);
      await assertParentRules(tx, input, { selfId: id, hasChildren: childrenCount > 0 });

      const now = new Date();
      await updateCategory(tx, id, {
        name: input.name,
        slug: input.slug,
        description: input.description,
        imagePath: input.imagePath,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        parentId: input.parentId,
        updatedAt: now,
      });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "category.update",
        entity: "category",
        entityId: id,
        oldValues: auditValues(category),
        newValues: auditValues({ ...category, ...input }),
        createdAt: now,
      });

      if (category.imagePath && category.imagePath !== input.imagePath) replacedImagePath = category.imagePath;
    });
  } catch (error) {
    if (error instanceof CategoryActionError) return { ok: false, error: error.message, fieldErrors: fieldErrorFor(error.message) };
    if (isDuplicateEntry(error)) return { ok: false, error: "That slug is already in use. Choose another.", fieldErrors: { slug: "Already in use." } };
    throw error;
  }

  // Only removed once the transaction that replaced/cleared it has actually committed.
  if (replacedImagePath) await deleteMediaImage(replacedImagePath);
  return { ok: true, id };
}

// ── Hide / show ─────────────────────────────────────────────────────────────────────────────

export async function setCategoryActive(id: number, isActive: boolean, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const category = await lockCategoryById(tx, id);
      if (!category) throw new CategoryActionError("Category not found.");
      if (category.isActive === isActive) {
        throw new CategoryActionError(`This category is already ${isActive ? "active" : "hidden"}.`);
      }

      const now = new Date();
      await updateCategory(tx, id, { isActive, updatedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "category.status_change",
        entity: "category",
        entityId: id,
        oldValues: { isActive: category.isActive },
        newValues: { isActive },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof CategoryActionError) return { ok: false, error: error.message };
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────

export type DeleteGuard = { allowed: true } | { allowed: false; reason: "has_children"; count: number } | { allowed: false; reason: "has_products"; count: number };

export async function checkCategoryDeletable(id: number): Promise<DeleteGuard> {
  const childrenCount = await countChildren(id);
  if (childrenCount > 0) return { allowed: false, reason: "has_children", count: childrenCount };
  const productCount = await countProductsByCategoryId(id);
  if (productCount > 0) return { allowed: false, reason: "has_products", count: productCount };
  return { allowed: true };
}

export async function deleteCategoryById(id: number, actor: Actor): Promise<StaffActionResult> {
  let imagePathToDelete: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const category = await lockCategoryById(tx, id);
      if (!category) throw new CategoryActionError("Category not found.");

      const childrenCount = await countChildren(category.id);
      if (childrenCount > 0) {
        throw new CategoryActionError(`This category has ${childrenCount} sub-${childrenCount === 1 ? "category" : "categories"}. Move or delete them first.`);
      }
      const productCount = await countProductsByCategoryId(category.id);
      if (productCount > 0) {
        throw new CategoryActionError(`${productCount} ${productCount === 1 ? "product uses" : "products use"} this category. Hide it instead of deleting it.`);
      }

      const now = new Date();
      await deleteCategory(tx, id);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "category.delete",
        entity: "category",
        entityId: id,
        oldValues: auditValues(category),
        newValues: {},
        createdAt: now,
      });
      imagePathToDelete = category.imagePath;
    });
  } catch (error) {
    if (error instanceof CategoryActionError) return { ok: false, error: error.message };
    throw error;
  }

  if (imagePathToDelete) await deleteMediaImage(imagePathToDelete);
  return { ok: true };
}
