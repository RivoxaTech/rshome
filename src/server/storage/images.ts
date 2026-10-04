import { randomBytes } from "node:crypto";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { env } from "@/server/env";
import { KNOWN_MEDIA_PATH_PATTERNS } from "./media-paths";

// Shared hosting has small memory limits (CLAUDE.md #11): one image in flight at a time, no cache.
sharp.concurrency(1);
sharp.cache(false);

const WIDTHS = [400, 800, 1200] as const;

// EXIF orientations 5-8 rotate the image 90/270 degrees, so the visually-correct (post
// auto-rotate) dimensions have width and height swapped relative to the raw metadata.
const SWAPPED_ORIENTATIONS = new Set([5, 6, 7, 8]);

export type ProcessedMediaImage = {
  /** Base path under UPLOAD_DIR/media, without the size suffix or extension. */
  path: string;
  /** Original (post auto-rotate) dimensions, for product_images.width/height and no-CLS rendering. */
  width: number;
  height: number;
};

/**
 * Catalogue photos (S22 SEC-03): a 24 MP camera photo fits; anything larger is refused from its
 * header before a pixel is decoded, since an 8 MB PNG can legitimately unpack to a gigabyte.
 */
export const MEDIA_MAX_INPUT_PIXELS = 40_000_000;
const MEDIA_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp"]);

export type MediaImageRefusal = "unsupported_type" | "too_many_pixels" | "unreadable";

/** Why an upload was refused; the route turns the reason into the staff member's message. */
export class MediaImageError extends Error {
  constructor(readonly reason: MediaImageRefusal) {
    super(`Media image refused: ${reason}`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-encodes an image into WebP at 400/800/1200px widths under `UPLOAD_DIR/media/<subdir>`,
 * stripping metadata (ARCHITECTURE.md §5). Pass a fixed `basename` for idempotent seeding
 * (re-encoding is skipped once the files exist); real uploads should omit it so each gets a
 * random, unpredictable filename (CLAUDE.md #8).
 */
export async function processMediaImage(
  buffer: Buffer,
  subdir: string,
  basename: string = randomBytes(16).toString("hex"),
): Promise<ProcessedMediaImage> {
  // The real type and size come from the file's own header (never its name or the browser's claim).
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new MediaImageError("unsupported_type");
  }
  if (!metadata.format || !MEDIA_FORMATS.has(metadata.format)) throw new MediaImageError("unsupported_type");
  const swapped = SWAPPED_ORIENTATIONS.has(metadata.orientation ?? 1);
  const width = (swapped ? metadata.height : metadata.width) ?? 0;
  const height = (swapped ? metadata.width : metadata.height) ?? 0;
  if (!width || !height) throw new MediaImageError("unreadable");
  if (width * height > MEDIA_MAX_INPUT_PIXELS) throw new MediaImageError("too_many_pixels");

  const mediaDir = path.join(env.UPLOAD_DIR, "media", subdir);
  await mkdir(mediaDir, { recursive: true });

  const source = sharp(buffer, { limitInputPixels: MEDIA_MAX_INPUT_PIXELS }).rotate();

  const targets = WIDTHS.map((targetWidth) => ({
    targetWidth,
    outputPath: path.join(mediaDir, `${basename}-${targetWidth}.webp`),
  }));

  for (const target of targets) {
    if (await fileExists(target.outputPath)) continue;
    const tempPath = `${target.outputPath}.${randomBytes(4).toString("hex")}.tmp`;
    await source
      .clone()
      .resize({ width: target.targetWidth, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(tempPath);
    await rename(tempPath, target.outputPath);
  }

  return { path: `${subdir}/${basename}`, width, height };
}

/**
 * Deletes the generated WebP sizes for a media image (CLAUDE.md #5: a category/product delete
 * removes its image files safely, never outside `UPLOAD_DIR/media`). Missing files are ignored.
 *
 * Two independent gates, not one: `mediaPath` must first match one of `KNOWN_MEDIA_PATH_PATTERNS`
 * (the exact `products/<32 hex>` / `categories/<32 hex>` shapes a real upload produces) — refusing
 * silently otherwise, before any filesystem call — and only then is the resolved path re-checked
 * against `mediaRoot`. The shape check guards against a bad value that was somehow still stored in
 * a DB row (e.g. a schema that validated it less strictly than it should have); the containment
 * check guards against a shape check that's wrong or incomplete. Neither alone is trusted to be
 * the only thing standing between a stored string and `unlink()`. Deliberately generic across
 * every caller (categories and products both funnel through here) — it has no notion of "this
 * caller expected a product path"; that distinction belongs one layer up, in the schema the path
 * was validated against before it was ever written to the row (`features/catalog/schemas.ts`).
 */
export async function deleteMediaImage(mediaPath: string): Promise<void> {
  if (!KNOWN_MEDIA_PATH_PATTERNS.some((pattern) => pattern.test(mediaPath))) return;

  const mediaRoot = path.join(env.UPLOAD_DIR, "media");
  for (const width of WIDTHS) {
    const filePath = path.resolve(mediaRoot, `${mediaPath}-${width}.webp`);
    if (!filePath.startsWith(mediaRoot + path.sep)) continue;
    try {
      await unlink(filePath);
    } catch {
      // Already gone.
    }
  }
}

/**
 * Payment screenshots (ARCHITECTURE.md §4.4). A phone screenshot is a few megapixels and a 24 MP
 * photo still fits; anything larger is refused from its header, before a pixel is decoded.
 */
export const PROOF_MAX_INPUT_PIXELS = 25_000_000;
const PROOF_MAX_SIDE = 2000;
const PROOF_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp"]);

export type ProofImageResult =
  | { ok: true; webp: Buffer }
  | { ok: false; reason: "unsupported_type" | "too_many_pixels" | "unreadable" };

/**
 * Re-encodes an uploaded payment screenshot: the real type comes from the file's own bytes
 * (never its name or the browser's claim), EXIF orientation is applied, the longest side is
 * capped at 2000 px, and the WebP output carries no metadata.
 */
export async function processProofImage(input: Buffer): Promise<ProofImageResult> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    return { ok: false, reason: "unsupported_type" };
  }
  if (!metadata.format || !PROOF_FORMATS.has(metadata.format)) return { ok: false, reason: "unsupported_type" };
  if (!metadata.width || !metadata.height) return { ok: false, reason: "unreadable" };
  if (metadata.width * metadata.height > PROOF_MAX_INPUT_PIXELS) return { ok: false, reason: "too_many_pixels" };

  try {
    const webp = await sharp(input, { limitInputPixels: PROOF_MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: PROOF_MAX_SIDE, height: PROOF_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { ok: true, webp };
  } catch {
    // A truncated or corrupt file that still had a valid header.
    return { ok: false, reason: "unreadable" };
  }
}
