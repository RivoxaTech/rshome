import Link from "next/link";
import type { PermissionKey } from "@/features/auth/permissions";
import { PANEL_NAV_ITEMS } from "@/components/panel/nav-items";

export function PanelSidebar({
  permissions,
  logoText,
}: {
  permissions: ReadonlySet<PermissionKey>;
  logoText: string;
}) {
  const items = PANEL_NAV_ITEMS.filter((item) => permissions.has(item.permission));

  return (
    <nav aria-label="Panel navigation" className="bg-card border-border w-56 shrink-0 border-r p-4">
      <p className="font-serif text-lg tracking-wide">{logoText}</p>
      <ul className="mt-6 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="hover:bg-secondary text-foreground block rounded-md px-3 py-2 text-sm transition-colors"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
