import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="bg-background flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">403 &mdash; Access denied</h1>
      <p className="text-muted-foreground text-sm">Your account does not have permission to view that page.</p>
      <Link href="/panel" className="text-primary text-sm underline underline-offset-2">
        Back to dashboard
      </Link>
    </div>
  );
}
