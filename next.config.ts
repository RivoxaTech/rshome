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
  experimental: {
    serverActions:
      extraServerActionOrigins.length > 0 ? { allowedOrigins: extraServerActionOrigins } : undefined,
  },
};

export default nextConfig;
