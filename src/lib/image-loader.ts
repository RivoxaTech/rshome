/**
 * next/image custom loader (ARCHITECTURE.md §5, D8): images live outside `public/` and are
 * pre-generated at 400/800/1200px by `server/storage/images.ts`, so there's no runtime
 * optimizer. `src` is a product/category image's base path (no size suffix or extension);
 * this just maps the requested width to the nearest generated size.
 */

const AVAILABLE_WIDTHS = [400, 800, 1200] as const;
type AvailableWidth = (typeof AVAILABLE_WIDTHS)[number];

export function nearestAvailableWidth(requested: number): AvailableWidth {
  return AVAILABLE_WIDTHS.reduce((best, candidate) =>
    Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best,
  );
}

export default function imageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  return `/media/${src}-${nearestAvailableWidth(width)}.webp`;
}
