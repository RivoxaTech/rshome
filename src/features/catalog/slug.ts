/** Pure (no DB): a lowercase, URL-safe slug, and the regex the shared Zod schema checks it against. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Diacritics are folded to their plain letter (e.g. "café" -> "cafe") before the rest strips out. */
export function generateSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
