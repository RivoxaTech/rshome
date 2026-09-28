#!/usr/bin/env node
// Runs `next build` (output: "standalone" in next.config.ts) and copies the
// two folders Next.js does not put in .next/standalone on its own, so the
// standalone server can be smoke-tested locally with `npm run start:standalone`.
//
// This is deliberately minimal for S1. S11 extends it into the full Linux-ready
// deploy artifact (the app/ subfolder layout, zipping) described in ARCHITECTURE.md §7.
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

console.log("Running next build...");
execSync("next build", { stdio: "inherit", cwd: root });

if (!existsSync(standaloneDir)) {
  throw new Error(`Expected ${standaloneDir} to exist after build. Is "output: standalone" set in next.config.ts?`);
}

const publicSrc = path.join(root, "public");
const publicDest = path.join(standaloneDir, "public");
if (existsSync(publicSrc)) {
  rmSync(publicDest, { recursive: true, force: true });
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log("Copied public/ into .next/standalone/public");
}

const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
if (existsSync(staticSrc)) {
  rmSync(staticDest, { recursive: true, force: true });
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log("Copied .next/static into .next/standalone/.next/static");
}

console.log("Standalone build ready at .next/standalone. Run: npm run start:standalone");
