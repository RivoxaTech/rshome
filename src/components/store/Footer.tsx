import type { Contact, SocialLinks } from "@/features/settings/schemas";

/** Ported from design-reference/src/routes/index.tsx (footer), extended with WhatsApp/Facebook (S2b #8). */
export function Footer({
  storeName,
  logoText,
  footerTagline,
  contact,
  socialLinks,
}: {
  storeName: string;
  logoText: string;
  footerTagline: string;
  contact: Contact;
  socialLinks: SocialLinks;
}) {
  return (
    <footer className="bg-card px-6 py-16 lg:px-10">
      <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-3">
        <div>
          <p className="font-serif text-xl tracking-[0.35em] uppercase">{logoText}</p>
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">{footerTagline}</p>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">{contact.address}</p>
        <div className="flex flex-col gap-2 text-xs tracking-[0.2em] uppercase">
          <a
            href={`https://wa.me/${contact.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-champagne transition-colors"
          >
            WhatsApp {contact.phone}
          </a>
          <a
            href={socialLinks.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-champagne transition-colors"
          >
            Facebook
          </a>
          <a
            href={socialLinks.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-champagne transition-colors"
          >
            {socialLinks.instagramHandle}
          </a>
        </div>
      </div>
      <p className="text-muted-foreground mx-auto mt-12 max-w-[1400px] text-[10px] tracking-[0.2em] uppercase">
        &copy; {new Date().getFullYear()} {storeName}. All rights reserved.
      </p>
    </footer>
  );
}
