import Link from "next/link";
import { whatsAppHref } from "@/components/store/WhatsAppButton";
import { POWERED_BY } from "@/config/credit";
import { PAGES } from "@/content/pages";
import type { Contact, SocialLinks } from "@/features/settings/schemas";
import { copyrightLine } from "@/lib/copyright";

const LINK = "hover:text-champagne transition-colors";

/**
 * Ported from design-reference/src/routes/index.tsx (footer), extended with WhatsApp/Facebook (S2b #8).
 * Every value comes from `settings` (S14): a blank social link simply isn't rendered.
 */
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
    <footer className="bg-card">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-16 lg:grid-cols-4 lg:px-10">
        <div>
          <p className="font-serif text-xl tracking-[0.35em] uppercase">{logoText}</p>
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">{footerTagline}</p>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">{contact.address}</p>
        <div className="flex flex-col gap-2 text-xs tracking-[0.2em] uppercase">
          <a href={whatsAppHref(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className={LINK}>
            WhatsApp {contact.phone}
          </a>
          {socialLinks.facebook && (
            <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className={LINK}>
              Facebook
            </a>
          )}
          {socialLinks.instagram && (
            <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className={LINK}>
              {socialLinks.instagramHandle || "Instagram"}
            </a>
          )}
        </div>
        {/* Data-driven from src/content/pages.ts (S19): adding a page there adds its link here, nothing else to wire up. "Track your order" is the one link here that isn't a content page — it mirrors the header's own /track link (Header.tsx). */}
        <div className="flex flex-col gap-2 text-xs tracking-[0.2em] uppercase">
          <Link href="/track" className={LINK}>
            Track your order
          </Link>
          {PAGES.map((page) => (
            <Link key={page.slug} href={`/${page.slug}`} className={LINK}>
              {page.title}
            </Link>
          ))}
        </div>
      </div>
      {/* A separate full-width bar, not more padding inside the cream section above, so there's no
          dead space stacking up beneath the credit row (S19 polish, owner feedback). */}
      <div className="bg-espresso text-background">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-3 px-6 py-5 text-center lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:text-left">
          <p className="text-background/70 text-[10px] tracking-[0.2em] uppercase">{copyrightLine(storeName, new Date())}</p>
          <a
            href={POWERED_BY.url}
            target="_blank"
            rel="noopener"
            aria-label={`Powered by ${POWERED_BY.name}, opens ${POWERED_BY.url} in a new tab`}
            className="text-background/70 hover:text-champagne inline-flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase transition-colors"
          >
            Powered by
            {POWERED_BY.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- next/image's global custom loader (next.config.ts) expects the media pipeline's path shape, not a plain public/ asset.
              <img
                src={POWERED_BY.logoPath}
                width={POWERED_BY.logoWidth}
                height={POWERED_BY.logoHeight}
                alt={POWERED_BY.name}
                // Below the fold: without this React's streaming renderer preloads it (S22 SPD-03).
                loading="lazy"
                className="h-[18px] w-auto"
              />
            ) : (
              POWERED_BY.name
            )}
          </a>
        </div>
      </div>
    </footer>
  );
}
