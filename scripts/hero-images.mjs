#!/usr/bin/env node
// Generates the home hero's WebP sizes in public/hero from two source photos (S22 HERO-01):
//   node scripts/hero-images.mjs <main photo> <accent photo>
// The main photo fills the hero; the accent photo is the small floating card. Both are
// re-encoded with sharp at quality 80 at the same three widths every image in the app has
// (`AVAILABLE_WIDTHS` in src/lib/image-loader.ts, the `deviceSizes` in next.config.ts), so the
// browser's srcset choice maps one-to-one onto a file; a source narrower than 1200 px is never
// enlarged. Sources stay out of the repo: only the generated files are committed, and
// `HERO_IMAGES` in src/config/home-content.ts records each largest file's size.
import path from "node:path";
import sharp from "sharp";

const [mainSource, accentSource] = process.argv.slice(2);
if (!mainSource || !accentSource) {
  console.error("Usage: node scripts/hero-images.mjs <main photo> <accent photo>");
  process.exit(1);
}

const WIDTHS = [400, 800, 1200];
const outDir = path.join(process.cwd(), "public", "hero");
const SETS = [
  { source: mainSource, name: "hero-main" },
  { source: accentSource, name: "hero-accent" },
];

for (const set of SETS) {
  for (const width of WIDTHS) {
    const target = path.join(outDir, `${set.name}-${width}.webp`);
    const info = await sharp(set.source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(target);
    console.log(`${path.relative(process.cwd(), target)}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
  }
}
