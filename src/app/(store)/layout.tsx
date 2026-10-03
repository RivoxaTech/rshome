import type { Metadata } from "next";
import { CartDrawer } from "@/components/store/cart/CartDrawer";
import { CartProvider } from "@/components/store/cart/CartProvider";
import { FloatingActions } from "@/components/store/FloatingActions";
import { Footer } from "@/components/store/Footer";
import { Header } from "@/components/store/Header";
import { STORE_NAV_ITEMS } from "@/components/store/nav-items";
import { whatsAppHref } from "@/components/store/WhatsAppButton";
import { features } from "@/config/features";
import { siteConfig } from "@/config/site.config";
import { getAnnouncementText, getContactInfo, getSocialLinks, getStoreIdentity } from "@/features/settings/service";

const navItems = features.wholesale ? STORE_NAV_ITEMS : STORE_NAV_ITEMS.filter((item) => item.href !== "/wholesale");

// ARCHITECTURE.md D7: render per request, never statically cached, so settings/discount/stock
// changes are visible on the next load and the build never needs a database connection.
export const dynamic = "force-dynamic";

/** The tab title is the store name from `settings` (S14), falling back to the config default. */
export async function generateMetadata(): Promise<Metadata> {
  const identity = await getStoreIdentity();
  return { title: { default: identity.storeName, template: `%s | ${identity.storeName}` }, description: siteConfig.tagline };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [contact, socialLinks, identity, announcementText] = await Promise.all([getContactInfo(), getSocialLinks(), getStoreIdentity(), getAnnouncementText()]);

  return (
    <CartProvider>
      {/* `data-announcement` lets PageContainer shorten its top offset when the bar is hidden (blank text). */}
      <div className="group/shell flex min-h-screen flex-1 flex-col" data-announcement={announcementText ? "on" : "off"}>
        <Header logoText={identity.logoText} announcementText={announcementText} navItems={navItems} />
        <main className="flex-1">{children}</main>
        <Footer
          storeName={identity.storeName}
          logoText={identity.logoText}
          footerTagline={siteConfig.footerTagline}
          contact={contact}
          socialLinks={socialLinks}
        />
      </div>
      <FloatingActions whatsappHref={whatsAppHref(contact.whatsapp)} />
      <CartDrawer deliveryNote={siteConfig.deliveryPendingNote} />
    </CartProvider>
  );
}
