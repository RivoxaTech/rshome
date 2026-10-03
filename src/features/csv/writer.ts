/**
 * Shared RFC 4180 CSV writer (S18): UTF-8 with a leading BOM (Excel needs it to read accents and
 * Urdu text correctly), CRLF row endings, and spreadsheet formula injection defeated by prefixing
 * a value that starts with `=`, `+`, `-`, `@` or a tab with an apostrophe. Lifted out of
 * `features/wholesale/csv.ts` (S17) so every CSV export in the app shares one escaping rule
 * instead of re-implementing it.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t"];

export function escapeCsvField(value: string): string {
  let field = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
  if (/[",\r\n]/.test(field)) field = `"${field.replace(/"/g, '""')}"`;
  return field;
}

function toRow(values: readonly string[]): string {
  return values.map(escapeCsvField).join(",");
}

/** BOM + header row + CRLF rows, with a trailing CRLF. */
export function buildCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [toRow(headers), ...rows.map((row) => toRow(row))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
