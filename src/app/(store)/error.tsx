"use client";

import { Button } from "@/components/store/Button";
import { PageContainer } from "@/components/store/PageContainer";

/** A storefront page that threw (S22 BUG-07): shown inside the store shell, in its own language. */
export default function StoreError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PageContainer className="text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-3 font-serif text-4xl lg:text-6xl">We couldn&apos;t load this page</h1>
      <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">
        Please try again in a moment. Your cart is safe. If it keeps happening, message us on WhatsApp.
      </p>
      {error.digest && <p className="text-muted-foreground mt-2 text-xs">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Button onClick={() => retry()}>Try again</Button>
        <Button href="/shop" variant="outline">
          Continue Shopping
        </Button>
      </div>
    </PageContainer>
  );
}
