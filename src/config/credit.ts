/**
 * The footer's "Powered by" credit (S19 polish). One place to change the link, label or logo.
 * `logoPath` is the single slot for the mark: a public/ asset path, or `null` to fall back to a
 * plain text wordmark instead of an image (never invent a file — see the footer's own comment).
 * This is the full icon+wordmark lockup, not just the icon mark: its "RIVOXA" letters are drawn in
 * solid white, so it only reads correctly on a dark background — the footer's own bottom bar.
 */
export const POWERED_BY = {
  name: "Rivoxa",
  url: "https://rivoxa.tech",
  logoPath: "/brand/rivoxa-logo.png" as string | null,
  logoWidth: 171,
  logoHeight: 24,
} as const;
