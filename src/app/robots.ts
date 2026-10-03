import type { MetadataRoute } from "next";
import { buildRobotsRules } from "@/features/seo/robots";
import { env } from "@/server/env";

// See src/app/sitemap.ts: forced dynamic for the same reason (D7), though robots.txt's own content
// never actually changes per request — consistency with sitemap.ts is simpler than reasoning about
// which of the two actually needs it.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return buildRobotsRules(env.APP_URL);
}
