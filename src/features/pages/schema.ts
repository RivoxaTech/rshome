/**
 * Pure types and validation for `src/content/pages.ts` (S19 owner decision: code-defined static
 * pages, no database, no panel editor). No DB or I/O here — `schema.test.ts` runs `validatePages`
 * against both synthetic fixtures and the real content file, so a future owner edit that breaks a
 * rule fails `npm test` rather than surfacing only at runtime.
 */

export type HeadingBlock = { type: "heading"; text: string };
export type ParagraphBlock = { type: "paragraph"; text: string };
export type ListBlock = { type: "list"; items: string[] };
export type OrderedListBlock = { type: "ordered"; items: string[] };
export type LinkBlock = { type: "link"; text: string; href: string };
/** Renders the live phone/WhatsApp/address from `features/settings/service.ts` — no text of its own. */
export type ContactBlock = { type: "contact" };

export type PageBlock = HeadingBlock | ParagraphBlock | ListBlock | OrderedListBlock | LinkBlock | ContactBlock;

export type PageContent = {
  slug: string;
  title: string;
  metaDescription: string;
  blocks: PageBlock[];
};

const TITLE_MAX = 70;
const META_DESCRIPTION_MAX = 160;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** https/mailto/tel, or a relative path (never `javascript:`/`data:`/a protocol-relative `//`). */
export function isAllowedHref(href: string): boolean {
  if (href.startsWith("https://")) return true;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return true;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return false;
}

function linkBlocksOf(blocks: PageBlock[]): LinkBlock[] {
  return blocks.filter((block): block is LinkBlock => block.type === "link");
}

/** An em dash (U+2014) or en dash (U+2013) — a plain hyphen inside a word (e.g. "tea-sets") is unaffected. */
const LONG_DASH = /[–—]/;

/** Every string a page shows to a customer: title, metaDescription, and each block's own text. */
function userFacingStrings(page: PageContent): string[] {
  const strings = [page.title, page.metaDescription];
  for (const block of page.blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
        strings.push(block.text);
        break;
      case "list":
      case "ordered":
        strings.push(...block.items);
        break;
      case "link":
        strings.push(block.text);
        break;
      case "contact":
        break;
    }
  }
  return strings;
}

/** Every rule a page in `src/content/pages.ts` must follow; returns one message per violation. */
export function validatePages(pages: PageContent[]): string[] {
  const errors: string[] = [];
  const seenSlugs = new Set<string>();

  for (const page of pages) {
    const label = `"${page.slug}"`;

    if (!SLUG_PATTERN.test(page.slug)) {
      errors.push(`${label}: slug must be lowercase letters, digits and single hyphens only.`);
    } else if (seenSlugs.has(page.slug)) {
      errors.push(`${label}: slug is not unique.`);
    }
    seenSlugs.add(page.slug);

    if (page.title.length === 0 || page.title.length > TITLE_MAX) {
      errors.push(`${label}: title must be 1-${TITLE_MAX} characters (got ${page.title.length}).`);
    }
    if (page.metaDescription.length === 0 || page.metaDescription.length > META_DESCRIPTION_MAX) {
      errors.push(`${label}: metaDescription must be 1-${META_DESCRIPTION_MAX} characters (got ${page.metaDescription.length}).`);
    }
    if (page.blocks.length === 0) {
      errors.push(`${label}: needs at least one block.`);
    }
    for (const link of linkBlocksOf(page.blocks)) {
      if (!isAllowedHref(link.href)) {
        errors.push(`${label}: link "${link.text}" has a disallowed href "${link.href}".`);
      }
    }
    if (userFacingStrings(page).some((text) => LONG_DASH.test(text))) {
      errors.push(`${label}: no em dash or en dash in page text, rewrite with a comma, full stop, colon or parentheses.`);
    }
  }

  return errors;
}
