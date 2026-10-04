/**
 * A LIKE pattern that matches `text` literally anywhere in the column (S22 BUG-06). MySQL's LIKE
 * treats `%` and `_` as wildcards and `\` as its escape character, so all three are escaped — the
 * one place for it, after five repos each kept a slightly different copy and one escaped nothing.
 */
export function likeContains(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}
