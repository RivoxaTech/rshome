import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/store/PageContainer";
import { WholesaleForm } from "@/components/store/wholesale/WholesaleForm";
import { features } from "@/config/features";
import { siteConfig } from "@/config/site.config";
import { getContactInfo, getStoreIdentity } from "@/features/settings/service";

export const metadata: Metadata = {
  // The store layout's title template appends the store name from settings (S14).
  title: "Wholesale & Bulk Orders",
  description:
    "Request wholesale pricing for tableware, tea sets, trays and decor for your business, event or venue.",
};

/** The wholesale inquiry page (REQUIREMENTS SF-08). Off when `features.wholesale` is off. */
export default async function WholesalePage() {
  if (!features.wholesale) notFound();
  const [contact, identity] = await Promise.all([getContactInfo(), getStoreIdentity()]);

  return (
    <PageContainer>
      <p className="eyebrow">Wholesale &amp; Bulk Orders</p>
      <h1 className="mt-3 font-serif text-4xl lg:text-6xl">Request Wholesale Pricing</h1>
      <p className="text-muted-foreground mt-6 max-w-xl text-sm leading-relaxed">
        Tell us what you&apos;re looking for and we&apos;ll get back to you with pricing for your business, event or venue.
      </p>
      <WholesaleForm
        businessTypes={siteConfig.wholesaleBusinessTypes}
        whatsappNumber={contact.whatsapp}
        whatsappMessage={siteConfig.wholesaleWhatsAppMessage.replace("{store}", identity.storeName)}
      />
    </PageContainer>
  );
}
