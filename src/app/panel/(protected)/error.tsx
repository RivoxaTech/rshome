"use client";

/** A panel page that threw (S22 BUG-07): stays inside the panel frame; the sidebar keeps working. */
export default function PanelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md text-sm">This page couldn&apos;t load. Try again; if it keeps failing, note the reference below.</p>
      {error.digest && <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>}
      <button type="button" onClick={() => retry()} className="bg-primary text-primary-foreground mt-2 rounded-lg px-4 py-2 text-sm font-medium">
        Try again
      </button>
    </div>
  );
}
