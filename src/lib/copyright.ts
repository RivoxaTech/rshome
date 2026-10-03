import { KARACHI_OFFSET_MS } from "@/lib/karachi-datetime";

/**
 * The footer's copyright line (S19 polish). The year comes from `now` shifted into Asia/Karachi
 * time (the same fixed +05:00 offset `lib/karachi-datetime.ts` already uses), not the host
 * process's own timezone, so the rollover at local midnight is always correct regardless of what
 * server the standalone build runs on. Pages render per request (ARCHITECTURE.md D7), so passing
 * `new Date()` here is always the current year, never a build-time value.
 */
export function copyrightLine(storeName: string, now: Date): string {
  const karachiYear = new Date(now.getTime() + KARACHI_OFFSET_MS).getUTCFullYear();
  return `© ${karachiYear} ${storeName}. All rights reserved.`;
}
