import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import "./zod-config";

describe("zod configuration (S22 SEC-02: no eval under the CSP)", () => {
  it("runs zod without JIT-compiled parsers", () => {
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.string() }).safeParse({ a: "x" }).success).toBe(true);
  });

  it("every feature schema module imports the config before defining a schema", () => {
    const root = path.join(process.cwd(), "src", "features");
    const schemaFiles: string[] = [];
    for (const feature of readdirSync(root, { withFileTypes: true })) {
      if (!feature.isDirectory()) continue;
      for (const name of readdirSync(path.join(root, feature.name))) {
        if (/^schemas?\.ts$/.test(name)) schemaFiles.push(path.join(root, feature.name, name));
      }
    }
    expect(schemaFiles.length).toBeGreaterThan(5);
    for (const file of schemaFiles) {
      const source = readFileSync(file, "utf8");
      if (!/from "zod"/.test(source)) continue;
      expect(source, path.relative(process.cwd(), file)).toMatch(/import "@\/lib\/zod-config";/);
    }
  });
});
