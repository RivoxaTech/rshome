/**
 * `processMediaImage`'s input gate (S22 SEC-03): the real type and pixel count come from the
 * file's header, and anything that isn't a JPG/PNG/WebP of at most 40 megapixels is refused
 * before a pixel is decoded. Writes go to vitest's temp UPLOAD_DIR, never the real one.
 */
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/server/env";
import { MEDIA_MAX_INPUT_PIXELS, MediaImageError, processMediaImage } from "./images";

const subdir = `test-${process.pid}`;

async function refusal(buffer: Buffer): Promise<string | null> {
  try {
    await processMediaImage(buffer, subdir);
    return null;
  } catch (error) {
    return error instanceof MediaImageError ? error.reason : `unexpected: ${String(error)}`;
  }
}

describe("processMediaImage input gate", () => {
  afterAll(async () => {
    await rm(path.join(env.UPLOAD_DIR, "media", subdir), { recursive: true, force: true });
  });

  it("accepts a JPG and writes the three WebP sizes", async () => {
    const jpeg = await sharp({ create: { width: 1300, height: 900, channels: 3, background: "#c9a" } }).jpeg().toBuffer();
    const result = await processMediaImage(jpeg, subdir);
    expect(result).toMatchObject({ width: 1300, height: 900 });
    const files = await readdir(path.join(env.UPLOAD_DIR, "media", subdir));
    const base = result.path.split("/")[1];
    expect(files.filter((name) => name.startsWith(base)).sort()).toEqual([`${base}-1200.webp`, `${base}-400.webp`, `${base}-800.webp`]);
  });

  it("refuses an SVG, a GIF and a text file as unsupported, from their bytes", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    expect(await refusal(svg)).toBe("unsupported_type");
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    expect(await refusal(gif)).toBe("unsupported_type");
    expect(await refusal(Buffer.from("MZ not an image at all"))).toBe("unsupported_type");
  });

  it("refuses an image over 40 megapixels before decoding it", async () => {
    // 7000 x 7000 = 49 MP, but a flat PNG is tiny: the cap has to come from the header, not the byte size.
    const bomb = await sharp({ create: { width: 7000, height: 7000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(7000 * 7000).toBeGreaterThan(MEDIA_MAX_INPUT_PIXELS);
    expect(await refusal(bomb)).toBe("too_many_pixels");
  }, 60_000);
});
