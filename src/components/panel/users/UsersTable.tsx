"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/panel/StatusPill";
import { UserActiveToggle } from "@/components/panel/users/UserRowActions";
import { USER_ACTIVE_COLORS, USER_INACTIVE_COLORS } from "@/components/panel/users/user-colors";
import type { StaffUserListItem } from "@/features/users/staff-service";

function detailHref(id: number, backHref: string): string {
  return `/panel/users/${id}?back=${encodeURIComponent(backHref)}`;
}

/** Stops a click reaching the row's own navigation (the name link and the quick action). */
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

function Status({ item, viewerId }: { item: StaffUserListItem; viewerId: number }) {
  return (
    <div className="flex items-center gap-1" onClick={stop}>
      <StatusPill label={item.isActive ? "Active" : "Inactive"} colors={item.isActive ? USER_ACTIVE_COLORS : USER_INACTIVE_COLORS} />
      {item.id !== viewerId && <UserActiveToggle id={item.id} isActive={item.isActive} />}
    </div>
  );
}

function UserRow({ item, viewerId, backHref }: { item: StaffUserListItem; viewerId: number; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <tr onClick={() => router.push(href)} className="border-border hover:bg-secondary/50 cursor-pointer border-b last:border-b-0">
      <td className="text-muted-foreground px-3 py-2">{item.serial}</td>
      <td className="px-3 py-2">
        <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
          {item.name}
        </Link>
        {item.id === viewerId && <span className="text-muted-foreground ml-1.5 text-xs">(you)</span>}
      </td>
      <td className="text-muted-foreground px-3 py-2">{item.email}</td>
      <td className="px-3 py-2 whitespace-nowrap">{item.roleName}</td>
      <td className="px-3 py-2">
        <Status item={item} viewerId={viewerId} />
      </td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">{item.lastLoginAt ?? "Never"}</td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">{item.createdAt}</td>
    </tr>
  );
}

function UserCard({ item, viewerId, backHref }: { item: StaffUserListItem; viewerId: number; backHref: string }) {
  const router = useRouter();
  const href = detailHref(item.id, backHref);

  return (
    <li onClick={() => router.push(href)} className="bg-card border-border cursor-pointer rounded-lg border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={href} onClick={stop} className="text-primary font-medium hover:underline">
            {item.name}
          </Link>
          {item.id === viewerId && <span className="text-muted-foreground ml-1.5 text-xs">(you)</span>}
          <p className="text-muted-foreground truncate text-xs">{item.email}</p>
        </div>
        <span className="shrink-0 text-xs font-medium">{item.roleName}</span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Last login {item.lastLoginAt ?? "never"} · Created {item.createdAt}
      </p>
      <div className="mt-2.5">
        <Status item={item} viewerId={viewerId} />
      </div>
    </li>
  );
}

export function UsersTable({ items, viewerId, backHref }: { items: StaffUserListItem[]; viewerId: number; backHref: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No users match this search.</p>;
  }

  return (
    <>
      <div className="bg-card border-border hidden rounded-lg border p-4 md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-xs">
                <th className="rounded-l-lg px-3 py-2 font-medium">S.N</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last login</th>
                <th className="rounded-r-lg px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:pt-4">
              {items.map((item) => (
                <UserRow key={item.id} item={item} viewerId={viewerId} backHref={backHref} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map((item) => (
          <UserCard key={item.id} item={item} viewerId={viewerId} backHref={backHref} />
        ))}
      </ul>
    </>
  );
}
