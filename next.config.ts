import type { NextConfig } from "next";

// Extra hosts (e.g. a demo tunnel) allowed to invoke Server Actions, beyond APP_URL's own origin
// which Next always allows. `serverActions.allowedOrigins` wants bare hosts, not full URLs.
const extraServerActionOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => new URL(origin).host);

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev only: the "N" indicator sits bottom-left by default, over the panel's profile block.
  devIndicators: { position: "bottom-right" },
  // ARCHITECTURE.md §5, D8: pre-generated WebP sizes served from /media, no runtime optimizer.
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
  },
  experimental: {
    serverActions:
      extraServerActionOrigins.length > 0 ? { allowedOrigins: extraServerActionOrigins } : undefined,
  },
};

export default nextConfig;
