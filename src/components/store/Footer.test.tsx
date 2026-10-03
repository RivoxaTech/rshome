import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";
import { copyrightLine } from "@/lib/copyright";

const contact = { phone: "0321 1234567", whatsapp: "923211234567", address: "Shop 1, Karachi" };
const socialLinks = { facebook: "https://facebook.com/rshome", instagram: "https://instagram.com/rshome", instagramHandle: "@rshome" };

function render() {
  return renderToStaticMarkup(
    <Footer storeName="RS Home" logoText="RS Home" footerTagline="Home Essentials" contact={contact} socialLinks={socialLinks} />,
  );
}

describe("Footer credit (S19 polish)", () => {
  it("links to https://rivoxa.tech with rel=noopener and no nofollow, so it's a real, followable backlink", () => {
    const html = render();
    expect(html).toContain('href="https://rivoxa.tech"');
    expect(html).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(html).not.toMatch(/rel="[^"]*nofollow[^"]*"/);
  });

  it("gives the credit link one clear accessible name naming the destination", () => {
    const html = render();
    expect(html).toContain('aria-label="Powered by Rivoxa, opens https://rivoxa.tech in a new tab"');
  });

  it("shows the logo with explicit width and height, so there's no layout shift", () => {
    const html = render();
    expect(html).toMatch(/<img[^>]*src="\/brand\/rivoxa-logo\.png"[^>]*width="171"[^>]*height="24"/);
  });

  it("shows today's Karachi-time year via the same copyrightLine helper the component calls", () => {
    const html = render();
    expect(html).toContain(copyrightLine("RS Home", new Date()));
  });

  it("leaves the existing footer WhatsApp/Facebook/Instagram text links unchanged", () => {
    const html = render();
    expect(html).toContain(">WhatsApp");
    expect(html).toContain(">Facebook<");
    expect(html).toContain(">@rshome<");
  });
});
