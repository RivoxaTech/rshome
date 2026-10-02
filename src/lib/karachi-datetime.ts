/**
 * Karachi-local date-times for panel forms (S12/S13): a `<input type="datetime-local">` value
 * ("YYYY-MM-DDTHH:mm") is read and written as Asia/Karachi time with the fixed +05:00 offset the
 * dashboard already uses (`features/dashboard/ranges.ts`) — Pakistan has no daylight saving, so a
 * fixed offset is exact and needs no timezone tables. Pure: no I/O, unit-tested directly.
 */

export const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-03T14:30" (Karachi) -> the UTC instant; null for anything that isn't a real date-time. */
export function karachiLocalToUtc(value: string): Date | null {
  const match = LOCAL_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const pretendUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Date.UTC silently rolls an impossible date over (31 Feb -> 3 Mar); refuse those instead.
  const check = new Date(pretendUtc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) {
    return null;
  }
  return new Date(pretendUtc - KARACHI_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A UTC instant -> the "YYYY-MM-DDTHH:mm" Karachi value a `datetime-local` input shows. */
export function utcToKarachiLocal(date: Date): string {
  const local = new Date(date.getTime() + KARACHI_OFFSET_MS);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A UTC instant as "3 Oct 2026, 14:30" in Karachi time, for list columns and detail rows. */
export function formatKarachiDateTime(date: Date): string {
  const local = new Date(date.getTime() + KARACHI_OFFSET_MS);
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}, ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}
