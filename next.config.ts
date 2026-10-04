import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/config/security-headers";

// Extra hosts (e.g. a reverse proxy or a second domain) allowed to invoke Server Actions, beyond
// APP_URL's own origin which Next always allows. `serverActions.allowedOrigins` wants bare hosts.
const extraServerActionOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => new URL(origin).host);

// The security headers are production-only (S22, D61): the dev server's HMR and React's dev
// tooling need eval and websockets the CSP would block, and nothing in development is exposed.
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The panel's profile block sits bottom-left; keep the dev indicator out of its way.
  devIndicators: {
    position: "bottom-right",
  },
  // ARCHITECTURE.md §5, D8: pre-generated WebP sizes served from /media, no runtime optimizer.
  // The srcset widths are exactly the generated sizes (S22 SPD-03): Next's defaults would list
  // sixteen widths that the loader snaps to the same three files. `image-loader.test.ts` keeps
  // this list and the loader's in step.
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    deviceSizes: [400, 800, 1200],
    imageSizes: [],
  },
  experimental: {
    serverActions:
      extraServerActionOrigins.length > 0 ? { allowedOrigins: extraServerActionOrigins } : undefined,
  },
  async headers() {
    return isProduction ? [{ source: "/:path*", headers: [...SECURITY_HEADERS] }] : [];
  },
};

export default nextConfig;
