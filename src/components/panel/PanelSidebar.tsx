import Link from "next/link";
import type { PermissionKey } from "@/features/auth/permissions";
import { PANEL_NAV_ITEMS } from "@/components/panel/nav-items";

export function PanelSidebar({ permissions }: { permissions: ReadonlySet<PermissionKey> }) {
  const items = PANEL_NAV_ITEMS.filter((item) => permissions.has(item.permission));

  return (
    <nav aria-label="Panel navigation" className="w-56 shrink-0 border-r border-black/10 p-4">
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="block rounded px-3 py-2 text-sm hover:bg-black/5">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
