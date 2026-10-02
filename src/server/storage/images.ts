import { randomBytes } from "node:crypto";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { env } from "@/server/env";

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
  const mediaDir = path.join(env.UPLOAD_DIR, "media", subdir);
  await mkdir(mediaDir, { recursive: true });

  const source = sharp(buffer, { limitInputPixels: 268402689 }).rotate();
  const metadata = await source.metadata();
  const swapped = SWAPPED_ORIENTATIONS.has(metadata.orientation ?? 1);
  const width = (swapped ? metadata.height : metadata.width) ?? 0;
  const height = (swapped ? metadata.width : metadata.height) ?? 0;
  if (!width || !height) {
    throw new Error("Could not read image dimensions");
  }

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
 */
export async function deleteMediaImage(mediaPath: string): Promise<void> {
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
