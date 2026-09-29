import { Button } from "@/components/store/Button";
import { PageContainer } from "@/components/store/PageContainer";

/** Shown inside the store shell when a page calls notFound() (unknown category or product). */
export default function StoreNotFound() {
  return (
    <PageContainer className="text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 font-serif text-4xl lg:text-6xl">Page not found</h1>
      <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">
        This page doesn&apos;t exist or is no longer available.
      </p>
      <div className="mt-8">
        <Button href="/shop">Continue Shopping</Button>
      </div>
    </PageContainer>
  );
}
