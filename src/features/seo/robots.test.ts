import { describe, expect, it } from "vitest";
import { buildRobotsRules } from "./robots";

describe("buildRobotsRules", () => {
  it("allows the storefront and disallows every staff/API/private path", () => {
    const robots = buildRobotsRules("https://rshome.example");
    const rules = robots.rules as { userAgent: string; allow: string; disallow: string[] };
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(expect.arrayContaining(["/panel", "/api", "/order", "/track", "/checkout", "/cart"]));
  });

  it("points at the sitemap built from APP_URL", () => {
    expect(buildRobotsRules("https://rshome.example").sitemap).toBe("https://rshome.example/sitemap.xml");
  });
});
