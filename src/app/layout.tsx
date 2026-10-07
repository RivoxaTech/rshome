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
  // iOS only grants the Push API to a site opened from its own Home Screen icon in standalone
  // mode, never an ordinary Safari tab (see manifest.ts) — this is the meta tag that actually
  // makes "Add to Home Screen" produce that standalone launch instead of a plain bookmark.
  appleWebApp: { capable: true, title: siteConfig.storeName, statusBarStyle: "default" },
  // icon.png/apple-icon.png (Next's file-convention icons) already cover the modern cases; these
  // are the precise small sizes some browsers' bookmark bars and tab strips still prefer, plus
  // the Windows pinned-tile config (browserconfig.xml, scripts/_make-favicons.mjs generated both
  // from the same logo as icon.png — rerun it if the logo ever changes).
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
  },
  other: {
    // Keep in sync with manifest.ts's theme_color and browserconfig.xml's TileColor.
    "msapplication-TileColor": "#3a2f22",
    "msapplication-config": "/browserconfig.xml",
  },
};

// `viewportFit: "cover"` lets the floating buttons read the phone's safe-area insets.
// `themeColor` tints the browser chrome itself on Android/iOS (the address bar area) — keep in
// sync with manifest.ts's theme_color and browserconfig.xml's TileColor.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3a2f22",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${cormorantGaramond.variable} ${jost.variable} thin-scrollbar h-full antialiased`}
    >
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
