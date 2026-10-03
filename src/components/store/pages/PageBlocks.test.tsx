import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageBlocks } from "./PageBlocks";

describe("PageBlocks", () => {
  it("renders block text as plain text, never as HTML (no dangerouslySetInnerHTML anywhere)", () => {
    const html = renderToStaticMarkup(
      <PageBlocks
        blocks={[
          { type: "heading", text: "<script>alert(1)</script>" },
          { type: "paragraph", text: "<img src=x onerror=alert(1)>" },
          { type: "list", items: ["<b>bold</b>"] },
        ]}
        contact={null}
      />,
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders nothing for a contact block when no contact data is given", () => {
    const html = renderToStaticMarkup(<PageBlocks blocks={[{ type: "contact" }]} contact={null} />);
    expect(html).not.toContain("WhatsApp");
  });
});

describe("PageBlocks contact icons (S19 polish)", () => {
  const contact = { phone: "0321 1234567", whatsapp: "923211234567", address: "Shop 1, Karachi" };
  const blankSocialLinks = { facebook: "", instagram: "", instagramHandle: "" };

  it("builds the WhatsApp icon link's href from the contact number, with an accessible name and rel noopener noreferrer", () => {
    const html = renderToStaticMarkup(<PageBlocks blocks={[{ type: "contact" }]} contact={contact} socialLinks={blankSocialLinks} />);
    expect(html).toContain('href="https://wa.me/923211234567"');
    expect(html).toContain('aria-label="Chat on WhatsApp"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("omits the Instagram and Facebook icons when their social links are blank", () => {
    const html = renderToStaticMarkup(<PageBlocks blocks={[{ type: "contact" }]} contact={contact} socialLinks={blankSocialLinks} />);
    expect(html).not.toContain('aria-label="Instagram"');
    expect(html).not.toContain('aria-label="Facebook"');
  });

  it("renders the Instagram and Facebook icons, each linking to its own social link, when set", () => {
    const html = renderToStaticMarkup(
      <PageBlocks
        blocks={[{ type: "contact" }]}
        contact={contact}
        socialLinks={{ facebook: "https://facebook.com/rshome", instagram: "https://instagram.com/rshome", instagramHandle: "@rshome" }}
      />,
    );
    expect(html).toContain('aria-label="Instagram"');
    expect(html).toContain('href="https://instagram.com/rshome"');
    expect(html).toContain('aria-label="Facebook"');
    expect(html).toContain('href="https://facebook.com/rshome"');
  });
});
