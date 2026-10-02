/**
 * Exactly what `processMediaImage` (`server/storage/images.ts`) produces for the panel's two
 * upload subdirs — `product_images.path` and `categories.image_path` never hold anything else.
 * This is the one place both sides of the guarantee read the shape from: the posted-path schemas
 * in `features/catalog/schemas.ts` (so a bad path is refused before it ever reaches a DB write)
 * and `deleteMediaImage`'s own refusal gate (so a bad path already in the DB, however it got
 * there, still can't make it delete the wrong thing). No `sharp`/`node:fs`/`@/server/env` import
 * here — this file is pure and tiny on purpose, so it's safe for `schemas.ts` to pull in even
 * though that file is also imported by "use client" components (CLAUDE.md §2: features may depend
 * on server infra, but this keeps that dependency to a leaf with no server-only side effects).
 */
export const PRODUCT_MEDIA_PATH_PATTERN = /^products\/[0-9a-f]{32}$/;
export const CATEGORY_MEDIA_PATH_PATTERN = /^categories\/[0-9a-f]{32}$/;

/** Every shape `deleteMediaImage` will act on, regardless of which feature's row the path came from. */
export const KNOWN_MEDIA_PATH_PATTERNS = [PRODUCT_MEDIA_PATH_PATTERN, CATEGORY_MEDIA_PATH_PATTERN] as const;
