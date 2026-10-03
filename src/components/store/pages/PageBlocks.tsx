import type { ReactNode } from "react";
import Link from "next/link";
import { WhatsAppGlyph, whatsAppHref } from "@/components/store/WhatsAppButton";
import { FacebookGlyph, InstagramGlyph } from "@/components/ui/Icon";
import type { Contact, SocialLinks } from "@/features/settings/schemas";
import type { PageBlock } from "@/features/pages/schema";

/**
 * Maps `src/content/pages.ts` blocks to plain React elements — every string is rendered as text
 * (React escapes it; never `dangerouslySetInnerHTML`), so a block's `text`/`items` can never inject
 * HTML, whatever the owner types into the content file.
 */
export function PageBlocks({
  blocks,
  contact,
  socialLinks,
}: {
  blocks: PageBlock[];
  contact: Contact | null;
  socialLinks?: SocialLinks | null;
}) {
  return (
    <div className="grid gap-6">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <h2 key={index} className="font-serif text-2xl lg:text-3xl">
                {block.text}
              </h2>
            );
          case "paragraph":
            return (
              <p key={index} className="text-muted-foreground max-w-2xl text-sm leading-relaxed whitespace-pre-line">
                {block.text}
              </p>
            );
          case "list":
            return (
              <ul key={index} className="text-muted-foreground ml-5 max-w-2xl list-disc text-sm leading-relaxed">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            );
          case "ordered":
            return (
              <ol key={index} className="text-muted-foreground ml-5 max-w-2xl list-decimal text-sm leading-relaxed">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ol>
            );
          case "link":
            return (
              <Link key={index} href={block.href} className="hover:text-champagne text-sm underline underline-offset-4 transition-colors">
                {block.text}
              </Link>
            );
          case "contact":
            return contact ? <ContactDetails key={index} contact={contact} socialLinks={socialLinks ?? null} /> : null;
        }
      })}
    </div>
  );
}

function ContactDetails({ contact, socialLinks }: { contact: Contact; socialLinks: SocialLinks | null }) {
  return (
    <div className="grid gap-4 text-sm">
      <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="hover:text-champagne transition-colors">
        {contact.phone}
      </a>
      <p className="text-muted-foreground leading-relaxed">{contact.address}</p>
      <div className="flex items-center gap-3">
        <SocialIconLink href={whatsAppHref(contact.whatsapp)} label="Chat on WhatsApp">
          <WhatsAppGlyph className="h-[18px] w-[18px]" />
        </SocialIconLink>
        {socialLinks?.instagram && (
          <SocialIconLink href={socialLinks.instagram} label="Instagram">
            <InstagramGlyph />
          </SocialIconLink>
        )}
        {socialLinks?.facebook && (
          <SocialIconLink href={socialLinks.facebook} label="Facebook">
            <FacebookGlyph />
          </SocialIconLink>
        )}
      </div>
    </div>
  );
}

/** A small round icon link (~40px, thin border, champagne hover) — the contact page's calmer alternative to the floating WhatsApp button's solid fill. */
function SocialIconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="border-espresso/30 hover:border-espresso hover:text-champagne flex h-10 w-10 items-center justify-center rounded-full border transition-colors"
    >
      {children}
    </a>
  );
}
