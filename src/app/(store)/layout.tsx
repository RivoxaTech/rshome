import { CartDrawer } from "@/components/store/cart/CartDrawer";
import { CartProvider } from "@/components/store/cart/CartProvider";
import { FloatingActions } from "@/components/store/FloatingActions";
import { Footer } from "@/components/store/Footer";
import { Header } from "@/components/store/Header";
import { STORE_NAV_ITEMS } from "@/components/store/nav-items";
import { whatsAppHref } from "@/components/store/WhatsAppButton";
import { siteConfig } from "@/config/site.config";
import { getContactInfo, getSocialLinks } from "@/features/settings/service";

// ARCHITECTURE.md D7: render per request, never statically cached, so settings/discount/stock
// changes are visible on the next load and the build never needs a database connection.
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [contact, socialLinks] = await Promise.all([getContactInfo(), getSocialLinks()]);

  return (
    <CartProvider>
      <div className="flex min-h-screen flex-1 flex-col">
        <Header logoText={siteConfig.logoText} announcementText={siteConfig.announcementText} navItems={STORE_NAV_ITEMS} />
        <main className="flex-1">{children}</main>
        <Footer
          storeName={siteConfig.storeName}
          logoText={siteConfig.logoText}
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
