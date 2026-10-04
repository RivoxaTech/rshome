/**
 * S22 QA-05 (panel only, owner Q7): the panel's dark palette must keep WCAG AA text contrast
 * (4.5:1) for the pairs the audit found short: `destructive-foreground` on `destructive`,
 * `muted-foreground` on `secondary`, and the red as text on the dark surfaces. Reads theme.css
 * directly, so a palette edit that regresses one of these fails here. The oklch → sRGB maths is
 * test-only (CSS Color 4 matrices; out-of-gamut channels clipped, as a browser does).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Oklch = [l: number, c: number, h: number];

function oklchToLinearSrgb([L, C, h]: Oklch): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function luminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Oklch, b: Oklch): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The `--name: oklch(l c h)` declarations inside one block of theme.css. */
function tokensOf(block: string): Record<string, Oklch> {
  const tokens: Record<string, Oklch> = {};
  for (const match of block.matchAll(/--([a-z-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return tokens;
}

const css = readFileSync(path.resolve(import.meta.dirname, "theme.css"), "utf8");
const darkBlock = css.slice(css.indexOf('[data-panel][data-theme="dark"]'));
const dark = tokensOf(darkBlock.slice(0, darkBlock.indexOf("}")));

describe("panel dark palette contrast (WCAG AA text, 4.5:1)", () => {
  it.each([
    ["destructive-foreground", "destructive"],
    ["muted-foreground", "secondary"],
    ["muted-foreground", "muted"],
    ["destructive", "background"],
    ["destructive", "card"],
    ["destructive", "popover"],
    ["foreground", "background"],
    ["primary-foreground", "primary"],
  ])("%s on %s", (text, surface) => {
    expect(dark[text], text).toBeDefined();
    expect(dark[surface], surface).toBeDefined();
    expect(contrast(dark[text], dark[surface])).toBeGreaterThanOrEqual(4.5);
  });
});
