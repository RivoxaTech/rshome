import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { StatCard as StatCardData } from "@/features/dashboard/service";

/** Pastel tint + icon per card (owner's reference image), readable in light and dark. */
const CARD_STYLE: Record<string, { bg: string; icon: keyof typeof ICON_PATHS; iconColor: string }> = {
  revenue: { bg: "bg-emerald-500/15", icon: "cash", iconColor: "text-emerald-600 dark:text-emerald-400" },
  orders: { bg: "bg-blue-500/15", icon: "box", iconColor: "text-blue-600 dark:text-blue-400" },
  aov: { bg: "bg-violet-500/15", icon: "trendingUp", iconColor: "text-violet-600 dark:text-violet-400" },
  wholesale: { bg: "bg-amber-500/15", icon: "wholesale", iconColor: "text-amber-600 dark:text-amber-400" },
};

const CHANGE_COLOR: Record<string, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  equal: "text-muted-foreground",
  zero: "text-muted-foreground",
  new: "text-blue-600 dark:text-blue-400",
  none: "text-muted-foreground",
};

/** The change badge's text: a signed percentage, or a word for the cases a percentage can't say. */
function changeText(card: StatCardData): string | null {
  const { kind, percent } = card.change;
  switch (kind) {
    case "none":
      return null;
    case "zero":
    case "equal":
      return "No change";
    case "new":
      return "New";
    default:
      return `${percent! > 0 ? "+" : ""}${percent}%`;
  }
}

export function StatCard({ card }: { card: StatCardData }) {
  const style = CARD_STYLE[card.key] ?? CARD_STYLE.revenue;
  const text = changeText(card);

  return (
    <div className={`border-border flex flex-col gap-1.5 rounded-lg border p-3 ${style.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{card.label}</span>
        <span className={`bg-card flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.iconColor}`}>
          <Icon d={ICON_PATHS[style.icon]} className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="text-xl leading-tight font-semibold">{card.value}</div>
      {card.sub && <div className="text-muted-foreground text-xs">{card.sub}</div>}
      {text && (
        <div className="flex items-center gap-1 text-xs">
          <span className={`font-medium ${CHANGE_COLOR[card.change.kind]}`}>{text}</span>
          {card.change.kind !== "none" && <span className="text-muted-foreground">vs previous</span>}
        </div>
      )}
    </div>
  );
}
