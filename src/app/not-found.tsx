import Link from "next/link";

/**
 * A URL outside every route group (anything but the storefront, which has its own branded 404
 * inside the store shell): plain, in the root layout's fonts (S22 BUG-07).
 */
export default function RootNotFound() {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-serif text-4xl">Page not found</h1>
      <p className="text-muted-foreground text-sm">This page doesn&apos;t exist.</p>
      <Link href="/" className="hover:text-champagne mt-4 text-xs tracking-[0.2em] uppercase underline underline-offset-4 transition-colors">
        Back to the shop
      </Link>
    </main>
  );
}
