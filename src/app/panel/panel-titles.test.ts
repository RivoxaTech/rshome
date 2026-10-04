/**
 * S22 QA-08: every panel page sets its tab title (`metadata.title` or `generateMetadata`), which
 * the panel layout's template turns into "<page> | <store name>". A page without one would fall
 * back to the bare store name, so this scan keeps new pages honest.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("panel page titles", () => {
  it("every page under src/app/panel exports a title", () => {
    const files = pages(path.resolve(import.meta.dirname));
    expect(files.length).toBeGreaterThan(30);
    const missing = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !/export const metadata\b/.test(source) && !/export async function generateMetadata\b/.test(source);
    });
    expect(missing.map((file) => path.relative(import.meta.dirname, file))).toEqual([]);
  });
});
