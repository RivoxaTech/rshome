import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site.config";

/**
 * Lets the panel be added to a phone's home screen as a standalone app (`next-env` convention,
 * served at /manifest.webmanifest). Needed for push notifications on iOS specifically: Safari
 * only grants the Push API to a site launched from its Home Screen icon in standalone mode
 * (iOS 16.4+), never to an ordinary browser tab — `NotificationBell.tsx`'s `isIosNotInstalled()`
 * already detects and explains this; this manifest plus `appleWebApp` in `app/layout.tsx` is what
 * makes "Add to Home Screen" actually produce a standalone launch instead of just a bookmark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.storeName,
    short_name: siteConfig.logoText,
    start_url: "/panel",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#3a2f22",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
