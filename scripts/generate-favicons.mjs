#!/usr/bin/env node
// Generates every app icon from one square source logo (S22 follow-up, 6 Oct):
//   node scripts/generate-favicons.mjs <source logo, square, ideally >=512px>
// Covers src/app/icon.png and apple-icon.png (Next's icon file conventions), src/app/favicon.ico
// (classic multi-res tab icon), public/favicon-{16,32}.png (precise small sizes some browsers'
// bookmark bars still prefer), public/android-chrome-{192,512}.png (the standard names
// manifest.ts and public/sw.js's notification icon point at), public/mstile-150x150.png
// (Windows pinned tiles, public/browserconfig.xml), and public/notification-badge.png (Android's
// monochrome status-bar badge). Source stays out of the repo; only the generated files are
// committed. Rerun this whenever the logo changes — nothing else needs editing.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const [source] = process.argv.slice(2);
if (!source) {
  console.error("Usage: node scripts/generate-favicons.mjs <source logo>");
  process.exit(1);
}

// ensureAlpha(): Next's own ICO decoder refuses a PNG frame with no alpha channel ("The PNG is
// not in RGBA format!") — a fully opaque source logo would otherwise get an RGB-only PNG.
async function pngBuffer(size) {
  return sharp(source).resize(size, size, { fit: "cover" }).ensureAlpha().png().toBuffer();
}

function png(size, dest) {
  return sharp(source).resize(size, size, { fit: "cover" }).png().toFile(dest);
}

/** A minimal, valid .ico container: PNG-compressed frames (supported since Windows Vista,
 * universally supported by every current browser/OS) — no need for raw BMP data or a new
 * dependency just to pack a handful of images. */
function packIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = header.length + frames.length * 16;
  const dirEntries = [];
  const dataParts = [];
  for (const { size, buffer } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    dirEntries.push(entry);
    dataParts.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...dirEntries, ...dataParts]);
}

async function main() {
  await png(512, "src/app/icon.png");
  await png(180, "src/app/apple-icon.png");
  console.log("wrote src/app/icon.png (512), apple-icon.png (180)");

  const icoSizes = [16, 32, 48];
  const icoFrames = await Promise.all(icoSizes.map(async (size) => ({ size, buffer: await pngBuffer(size) })));
  await writeFile("src/app/favicon.ico", packIco(icoFrames));
  console.log("wrote src/app/favicon.ico (16/32/48)");

  await png(16, "public/favicon-16x16.png");
  await png(32, "public/favicon-32x32.png");
  console.log("wrote public/favicon-16x16.png, favicon-32x32.png");

  await png(192, "public/android-chrome-192x192.png");
  await png(512, "public/android-chrome-512x512.png");
  console.log("wrote public/android-chrome-192x192.png, android-chrome-512x512.png");

  await png(150, "public/mstile-150x150.png");
  console.log("wrote public/mstile-150x150.png");

  await png(96, "public/notification-badge.png");
  console.log("wrote public/notification-badge.png");
}

main();
