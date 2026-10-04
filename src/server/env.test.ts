import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

/**
 * S22 SEC-01: `src/server/env.ts` once imported `./load-env`, whose static `.env.local` path made
 * Next's file tracer copy the developer's `.env.local` (database password, session secret, SMTP
 * and VAPID secrets) into `.next/standalone`, i.e. into the deploy artifact. App code must leave
 * env loading to Next; only the CLI entry points (scripts, drizzle.config.ts) load dotenv.
 */
describe("env loading boundary", () => {
  it("app code never imports the dotenv loader", () => {
    const importsLoadEnv = (source: string) => /(import|from)\s+["'][^"']*load-env["']/.test(source);
    expect(importsLoadEnv(read("src/server/env.ts"))).toBe(false);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && entry.name !== "load-env.ts" && importsLoadEnv(readFileSync(full, "utf8"))) {
          offenders.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, "src"));
    expect(offenders).toEqual([]);
  });

  it("every CLI entry point loads dotenv itself", () => {
    const scripts = readdirSync(path.join(root, "scripts")).filter((name) => name.endsWith(".ts"));
    for (const script of scripts) expect(read(path.join("scripts", script)), script).toMatch(/import "\.\.\/src\/server\/load-env"/);
    expect(read("drizzle.config.ts")).toMatch(/load-env/);
  });

  it("the build script strips env files from the standalone output", () => {
    expect(read("scripts/build-standalone.mjs")).toMatch(/\.env/);
    expect(JSON.parse(read("package.json")).scripts["start:standalone"]).toContain("--env-file=.env.local");
  });
});
