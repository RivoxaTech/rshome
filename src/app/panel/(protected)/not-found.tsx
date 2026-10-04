import Link from "next/link";
import { firstAllowedPath } from "@/features/auth/landing";
import { requireSession } from "@/server/auth/permissions";

/** A panel record that doesn't exist (a deleted order, a stale link): inside the panel frame, like the 403 page (S22 BUG-07). */
export default async function PanelNotFound() {
  const session = await requireSession();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground text-sm">This record doesn&apos;t exist or was deleted.</p>
      <Link href={firstAllowedPath(session.permissions)} className="text-primary text-sm underline underline-offset-2">
        Back
      </Link>
    </div>
  );
}
