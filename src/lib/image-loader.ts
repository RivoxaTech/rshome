/**
 * next/image custom loader (ARCHITECTURE.md §5, D8): images live outside `public/` and are
 * pre-generated at 400/800/1200px by `server/storage/images.ts`, so there's no runtime
 * optimizer. `src` is a product/category image's base path (no size suffix or extension);
 * this just maps the requested width to the nearest generated size.
 */

/** The widths `server/storage/images.ts` writes; `next.config.ts`'s `deviceSizes` lists the same. */
export const AVAILABLE_WIDTHS = [400, 800, 1200] as const;
type AvailableWidth = (typeof AVAILABLE_WIDTHS)[number];

export function nearestAvailableWidth(requested: number): AvailableWidth {
  return AVAILABLE_WIDTHS.reduce((best, candidate) =>
    Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best,
  );
}

export default function imageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  return `/media/${src}-${nearestAvailableWidth(width)}.webp`;
}

/**
 * A photo shipped in `public/` at the same three widths, `<basePath>-<width>.webp` (the home
 * hero, S22 HERO-01, written by `scripts/hero-images.mjs`): `width`/`height` are the largest
 * file's, for the aspect ratio.
 */
export type StaticImageSet = { basePath: string; width: number; height: number; alt: string };

/** The file of `image` nearest to the requested width: the per-image `loader` for `next/image`. */
export function staticImagePath(image: Pick<StaticImageSet, "basePath">, requested: number): string {
  return `${image.basePath}-${nearestAvailableWidth(requested)}.webp`;
}
