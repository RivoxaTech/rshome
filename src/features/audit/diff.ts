/**
 * Turns an audit row's two JSON snapshots into a readable key/value diff for the viewer (S20).
 * Pure, unit-tested. Defence in depth, since the viewer renders whatever any past or future
 * writer stored: values are plain strings for React to render as text (never HTML), a key that
 * looks like a secret is masked whatever its value, and a long value is truncated so one huge
 * snapshot can't flood the page.
 */

type DiffRow = { key: string; oldValue: string | null; newValue: string | null; changed: boolean };

type AuditDiff =
  | { kind: "diff"; rows: DiffRow[] }
  /** A snapshot that isn't a JSON object (a bare string, an array, or unparseable text): shown as-is, pretty-printed when possible. */
  | { kind: "raw"; oldText: string | null; newText: string | null };

export const MAX_VALUE_LENGTH = 2_000;
export const MASKED = "[hidden]";

/** Keys whose value must never be shown even if a writer slipped one into a snapshot. */
const SECRET_KEY = /password|passwd|hash|secret|token|cookie|session/i;

function parseSnapshot(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __unparseable: text };
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** One value as the text the viewer prints: nested objects pretty-printed, strings bare, null/undefined as null. */
export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}… (${text.length - MAX_VALUE_LENGTH} more characters)` : text;
}

export function buildAuditDiff(oldText: string | null, newText: string | null): AuditDiff {
  const oldValue = parseSnapshot(oldText);
  const newValue = parseSnapshot(newText);

  if ((oldValue !== null && !isPlainObject(oldValue)) || (newValue !== null && !isPlainObject(newValue))) {
    return { kind: "raw", oldText: formatValue(oldValue), newText: formatValue(newValue) };
  }

  const oldObject = oldValue ?? {};
  const newObject = newValue ?? {};
  const keys = [...new Set([...Object.keys(oldObject), ...Object.keys(newObject)])];
  const rows = keys.map((key) => {
    const masked = SECRET_KEY.test(key);
    const before = key in oldObject ? (masked ? MASKED : formatValue(oldObject[key])) : null;
    const after = key in newObject ? (masked ? MASKED : formatValue(newObject[key])) : null;
    // Compared on the raw JSON, so a `changed` flag isn't fooled by the truncation above.
    const changed = oldText !== null && newText !== null && JSON.stringify(oldObject[key]) !== JSON.stringify(newObject[key]);
    return { key, oldValue: before, newValue: after, changed };
  });
  return { kind: "diff", rows };
}
