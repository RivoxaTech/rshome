import type { PageContent } from "@/features/pages/schema";

/**
 * The five static pages (S19 owner decision: code-defined, no database, no panel editor — the
 * owner edits this file directly). Each entry is picked up automatically by its route
 * (`src/app/(store)/<slug>/page.tsx`), the footer (`components/store/Footer.tsx`) and the sitemap
 * (`app/sitemap.ts`) — there is nothing else to wire up.
 *
 * How to edit:
 * - Change a line of text: edit the `text` (or `items`) of the block you want to change and save;
 *   the storefront shows it on the very next request (ARCHITECTURE.md D7), no rebuild needed in dev.
 * - Add a paragraph: add another `{ type: "paragraph", text: "..." }` object to that page's `blocks`.
 * - Add a new page: add one more object to the `PAGES` array below, with a route folder at
 *   `src/app/(store)/<slug>/page.tsx` (copy an existing one, e.g. `about/page.tsx`, and change the
 *   slug it looks up) — it then appears at `/<slug>`, in the footer and in the sitemap automatically.
 * - Hide a page: remove its entry from `PAGES` (and its route folder, so the URL 404s cleanly).
 * - Keep `title` to 70 characters and `metaDescription` to 160 — `npm test` checks both, and the
 *   link in any `link` block, against `src/features/pages/schema.ts#validatePages`.
 * - The `contact` block needs no text: it renders the shop's current phone, WhatsApp and address
 *   straight from the panel's saved settings, never from this file.
 */
export const PAGES: PageContent[] = [
  {
    slug: "contact",
    title: "Contact Us",
    metaDescription: "Get in touch with RS Home for questions about orders, products or wholesale pricing.",
    blocks: [
      { type: "heading", text: "Contact Us" },
      {
        type: "paragraph",
        text: "We're happy to help with an order, a product question, or a wholesale request. Reach us by phone, WhatsApp, or in person at our Karachi store.",
      },
      { type: "contact" },
    ],
  },
  {
    slug: "about",
    title: "About RS Home",
    metaDescription: "RS Home curates luxury tableware, tea sets, trays and decor from our store in DHA Phase 6, Karachi.",
    blocks: [
      { type: "heading", text: "About RS Home" },
      // TODO: owner to review — replace with the store's own story in its own words.
      {
        type: "paragraph",
        text: "RS Home curates luxury tableware, tea sets, trays and home decor for everyday living and special occasions. Every piece is chosen for how it looks on your table and how long it lasts in your home.",
      },
      {
        type: "paragraph",
        text: "We're based in DHA Phase 6, Karachi, and ship nationwide. We also work with hotels, restaurants, event planners and retailers through our wholesale program.",
      },
    ],
  },
  {
    slug: "shipping-returns",
    title: "Shipping & Returns",
    metaDescription: "How delivery, cash on delivery and bank-transfer payments work at RS Home, and what to do about a return.",
    blocks: [
      { type: "heading", text: "Shipping" },
      {
        type: "paragraph",
        text: "We deliver nationwide across Pakistan, and internationally by courier. Every order's delivery charge depends on weight, destination and parcel size, so we confirm it with you on WhatsApp after you place it. Your order page shows the charge as soon as we've set it.",
      },
      {
        type: "list",
        items: [
          "Cash on Delivery (COD) is available within Pakistan only.",
          "Bank transfer is available for every destination, with a payment screenshot uploaded at checkout.",
          "You'll always see the final delivery charge before it's added to your order total.",
        ],
      },
      { type: "heading", text: "Returns" },
      // TODO: owner to review and confirm the store's actual returns policy before launch.
      {
        type: "paragraph",
        text: "Our returns policy is being finalized. If there's a problem with your order, please message us on WhatsApp before sending anything back, and we'll sort it out with you.",
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    metaDescription: "How RS Home collects, uses and protects the information you share with us.",
    blocks: [
      { type: "heading", text: "Privacy Policy" },
      // TODO: owner to review — placeholder text, not a reviewed legal policy.
      {
        type: "paragraph",
        text: "We collect only the information needed to process your order: your name, phone number, delivery address and, if you choose to give it, your email. We use it to fulfil your order, contact you about it, and nothing else.",
      },
      {
        type: "paragraph",
        text: "We don't sell or share your information with third parties, other than the courier needed to deliver your order. Payment screenshots you upload are stored securely and only seen by our staff for order verification.",
      },
      {
        type: "paragraph",
        text: "If you have a question about your data, or would like it removed, message us and we'll help.",
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms & Conditions",
    metaDescription: "The terms that apply to orders placed with RS Home.",
    blocks: [
      { type: "heading", text: "Terms & Conditions" },
      // TODO: owner to review — placeholder text, not a reviewed legal document.
      {
        type: "paragraph",
        text: "By placing an order with RS Home, you agree to pay the total shown on your order, including any delivery charge once it's confirmed. Product photos are representative; natural variation in handmade and ceramic items is normal and not a defect.",
      },
      {
        type: "paragraph",
        text: "Orders paid by bank transfer are confirmed once we've verified your payment screenshot. Cash on Delivery is available within Pakistan only. We reserve the right to cancel an order we can't fulfil, in which case we'll let you know and refund any payment already made.",
      },
    ],
  },
];

export function getPageBySlug(slug: string): PageContent | null {
  return PAGES.find((page) => page.slug === slug) ?? null;
}
