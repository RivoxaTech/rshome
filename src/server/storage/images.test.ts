/**
 * `deleteMediaImage`'s own refusal gate (ARCHITECTURE.md D54 hardening): a path must match one of
 * `KNOWN_MEDIA_PATH_PATTERNS` before anything is resolved or unlinked, in addition to (not instead
 * of) the existing `UPLOAD_DIR/media`-containment check. Pure unit test, no DB: `node:fs/promises`
 * is mocked so this never touches the real filesystem, and asserts `unlink` is (or isn't) called
 * rather than checking anything on disk.
 *
 * The cross-folder case this file does *not* assert on — "a product's row holding a
 * `categories/<hex>` path" — is deliberately out of scope here: `deleteMediaImage` is shared by
 * both categories and products and has no way to know which feature's row called it, so it
 * correctly allows any known shape regardless of caller (see the last test below). Refusing a
 * path that's the *wrong* known shape for a given caller is the posted-path schema's job, one
 * layer up (`features/catalog/schemas.test.ts#productImageSchema`).
 */
import path from "node:path";
import { unlink } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/server/env";
import { deleteMediaImage } from "./images";

vi.mock("node:fs/promises", () => ({ unlink: vi.fn().mockResolvedValue(undefined) }));

const WIDTHS = [400, 800, 1200];
const hex32 = "a".repeat(32);

describe("deleteMediaImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses every bad shape silently — never calls unlink", async () => {
    const badPaths = [
      "../x",
      "products/../x",
      "C:\\x",
      "/etc/x",
      "https://x",
      "proofs/" + hex32,
      "products/" + hex32.toUpperCase(),
      "",
    ];
    for (const badPath of badPaths) {
      await deleteMediaImage(badPath);
      expect(unlink, `expected "${badPath}" to never call unlink`).not.toHaveBeenCalled();
    }
  });

  it("deletes every WebP size for a real product path", async () => {
    await deleteMediaImage(`products/${hex32}`);
    expect(unlink).toHaveBeenCalledTimes(WIDTHS.length);
    for (const width of WIDTHS) {
      expect(unlink).toHaveBeenCalledWith(path.resolve(env.UPLOAD_DIR, "media", `products/${hex32}-${width}.webp`));
    }
  });

  it("deletes every WebP size for a real category path too — it's generic across both callers", async () => {
    await deleteMediaImage(`categories/${hex32}`);
    expect(unlink).toHaveBeenCalledTimes(WIDTHS.length);
    for (const width of WIDTHS) {
      expect(unlink).toHaveBeenCalledWith(path.resolve(env.UPLOAD_DIR, "media", `categories/${hex32}-${width}.webp`));
    }
  });

  it("never recognises the dev seed shape (seed/<name>) — a shared placeholder file is never deleted this way", async () => {
    await deleteMediaImage("seed/tableware");
    expect(unlink).not.toHaveBeenCalled();
  });
});
