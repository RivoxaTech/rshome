#!/usr/bin/env node
// Runs `next build` (output: "standalone" in next.config.ts) and copies the two folders Next.js
// does not put in .next/standalone on its own, so the standalone server can be smoke-tested
// locally with `npm run start:standalone` and the folder can be zipped for the host
// (docs/DEPLOY.md). The deploy build runs on Linux (ARCHITECTURE.md §7); a Windows build
// bundles win32 sharp binaries that won't run there.
import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

// Turbopack needs native bindings; this dev laptop's Smart App Control once blocked the win32 one
// (falls back to WASM, which Turbopack's build step refuses to run on). The real deploy build
// happens on Linux (ARCHITECTURE.md D3), where the native binary loads fine and Turbopack runs.
const buildCommand = process.platform === "win32" ? "next build --webpack" : "next build";

console.log(`Running ${buildCommand}...`);
execSync(buildCommand, { stdio: "inherit", cwd: root });

if (!existsSync(standaloneDir)) {
  throw new Error(`Expected ${standaloneDir} to exist after build. Is "output: standalone" set in next.config.ts?`);
}

// Secrets never travel with the bundle (S22, SEC-01): the host sets its env vars in cPanel's Node
// app screen, and a local smoke test passes them with `node --env-file=.env.local`. Next copies
// `.env`/`.env.production` on its own, and anything its file tracer picks up lands here too.
const envFiles = readdirSync(standaloneDir).filter((name) => name.startsWith(".env"));
for (const name of envFiles) {
  rmSync(path.join(standaloneDir, name), { force: true });
  console.log(`Removed ${name} from .next/standalone`);
}
if (readdirSync(standaloneDir).some((name) => name.startsWith(".env"))) {
  throw new Error("An .env file is still inside .next/standalone; refusing to produce a bundle with secrets in it.");
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
