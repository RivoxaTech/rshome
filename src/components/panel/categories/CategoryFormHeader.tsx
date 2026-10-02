import Link from "next/link";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

/** The back chevron + title row shared by the new/edit category pages (mirrors the wholesale/order detail pages). */
export function CategoryFormHeader({ title, backHref }: { title: string; backHref: string }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <Link
        href={backHref}
        aria-label="Back to categories"
        className="text-muted-foreground hover:bg-secondary hover:text-foreground -ml-1.5 shrink-0 rounded-md p-1.5"
      >
        <Icon d={ICON_PATHS.chevronLeft} className="h-4 w-4" />
      </Link>
      <h1 className="text-base font-semibold">{title}</h1>
    </div>
  );
}
