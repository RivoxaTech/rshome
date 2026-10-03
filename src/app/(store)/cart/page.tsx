import type { Metadata } from "next";
import { CartPageContent } from "@/components/store/cart/CartPageContent";
import { PageContainer } from "@/components/store/PageContainer";
import { siteConfig } from "@/config/site.config";
import { noindexRobots } from "@/features/seo/metadata";

export const metadata: Metadata = { robots: noindexRobots };

/** The cart itself lives in the browser (CartProvider); this frame only sets the copy. */
export default function CartPage() {
  return (
    <PageContainer>
      <p className="eyebrow">Cart</p>
      <h1 className="mt-3 font-serif text-4xl lg:text-6xl">Your Cart</h1>
      <CartPageContent deliveryNote={siteConfig.deliveryPendingNote} />
    </PageContainer>
  );
}
