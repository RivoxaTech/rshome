"use client";

/**
 * The last-resort error page (S22 BUG-07): replaces the root layout when it or the shell throws,
 * so it carries its own <html>/<body> and plain inline styles — Next's own default page would
 * otherwise show. Production strips the error message; only the digest reaches the browser.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#faf7f2", color: "#271e1a", fontFamily: "Georgia, serif", textAlign: "center", padding: 24 }}>
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.6 }}>Something went wrong</p>
          <h1 style={{ fontSize: 32, fontWeight: 400, margin: "12px 0" }}>We couldn&apos;t load this page</h1>
          <p style={{ fontSize: 14, opacity: 0.75, maxWidth: 420 }}>Please try again in a moment. If it keeps happening, message us on WhatsApp.</p>
          {error.digest && <p style={{ fontSize: 11, opacity: 0.5 }}>Reference: {error.digest}</p>}
          <button type="button" onClick={() => retry()} style={{ marginTop: 24, padding: "12px 28px", border: "1px solid #271e1a", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
