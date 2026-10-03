import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { FocusModality } from "@/components/ui/FocusModality";
import { siteConfig } from "@/config/site.config";
import { env } from "@/server/env";
import "./theme.css";

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: siteConfig.storeName,
  description: siteConfig.tagline,
};

// `viewportFit: "cover"` lets the floating buttons read the phone's safe-area insets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${cormorantGaramond.variable} ${jost.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's cz-shortcut-listen) inject
          attributes onto <body> before React hydrates; this only silences that mismatch on this
          one element, not real hydration bugs in the tree below it. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <FocusModality />
        {children}
      </body>
    </html>
  );
}
