import { randomBytes } from "node:crypto";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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
