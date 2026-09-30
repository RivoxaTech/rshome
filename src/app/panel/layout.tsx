import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { siteConfig } from "@/config/site.config";
import { readPanelTheme } from "./panel-theme";

// The panel's own sans-serif (owner decision C21); the storefront keeps its fonts.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `Panel · ${siteConfig.storeName}`,
  robots: { index: false, follow: false },
};

/** Every panel page, signed in or not: the panel's tokens (`data-panel`), font and light/dark theme. */
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  return (
    <div
      data-panel=""
      data-theme={await readPanelTheme()}
      className={`${inter.variable} font-panel bg-background text-foreground flex min-h-dvh flex-1 flex-col`}
    >
      {children}
    </div>
  );
}
