/**
 * The panel's status pill palette (S22 QA-09): a dot, a tinted background and a readable text
 * colour per hue, light and dark. Every status map (order tabs, wholesale, coupons, discounts,
 * products, users, roles, zones) picks from here, so a hue is tuned in one place. Tailwind reads
 * the class names from this file like any other source file.
 */
export type PillColors = { dot: string; bg: string; text: string };

export const PILL_COLORS = {
  emerald: { dot: "bg-emerald-500", bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
  amber: { dot: "bg-amber-500", bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
  orange: { dot: "bg-orange-500", bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-400" },
  blue: { dot: "bg-blue-500", bg: "bg-blue-500/15", text: "text-blue-700 dark:text-blue-400" },
  sky: { dot: "bg-sky-500", bg: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-400" },
  purple: { dot: "bg-purple-500", bg: "bg-purple-500/15", text: "text-purple-700 dark:text-purple-400" },
  red: { dot: "bg-red-500", bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400" },
  gray: { dot: "bg-gray-400", bg: "bg-gray-400/15", text: "text-gray-600 dark:text-gray-400" },
  muted: { dot: "bg-muted-foreground/60", bg: "bg-muted", text: "text-muted-foreground" },
} as const satisfies Record<string, PillColors>;
