import type { Metadata } from "next";
import { CheckoutForm } from "@/components/store/checkout/CheckoutForm";
import { PageContainer } from "@/components/store/PageContainer";
import { DEFAULT_COUNTRY, getCountryOptions } from "@/config/countries";
import { features } from "@/config/features";
import { siteConfig } from "@/config/site.config";
import { noindexRobots } from "@/features/seo/metadata";
import { getBankAccounts } from "@/features/settings/service";

export const metadata: Metadata = { robots: noindexRobots };

/** The cart comes from the browser (CartProvider); this frame sets the copy, the country list and the bank details. */
export default async function CheckoutPage() {
  const bankAccounts = await getBankAccounts();
  return (
    <PageContainer>
      <p className="eyebrow">Checkout</p>
      <h1 className="mt-3 font-serif text-4xl lg:text-6xl">Your Details</h1>
      <CheckoutForm
        countries={getCountryOptions()}
        defaultCountry={DEFAULT_COUNTRY}
        codEnabled={features.cod}
        couponsEnabled={features.coupons}
        deliveryNote={siteConfig.deliveryPendingNote}
        emailHint={siteConfig.checkoutEmailHint}
        bankAccounts={bankAccounts}
      />
    </PageContainer>
  );
}
