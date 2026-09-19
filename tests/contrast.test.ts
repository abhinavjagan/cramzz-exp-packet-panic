import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/style.css"), "utf8");
const NETWORK_BACKGROUND = "#0a1512";
const CANDIDATE_OPACITY = 0.95;

describe("network non-text contrast", () => {
  it.each(["fast", "risky"])("keeps %s candidate links at 3:1 or better", (quality) => {
    const match = css.match(new RegExp(`\\.network-edge\\.${quality} line \\{[^}]*stroke:\\s*(#[0-9a-f]{6})`, "i"));
    expect(match?.[1], `${quality} stroke colour`).toBeDefined();
    const composited = composite(match?.[1] as string, NETWORK_BACKGROUND, CANDIDATE_OPACITY);
    expect(contrastRatio(composited, NETWORK_BACKGROUND)).toBeGreaterThanOrEqual(3);
  });
});

function composite(foreground: string, background: string, opacity: number): [number, number, number] {
  const front = channels(foreground);
  const back = channels(background);
  return front.map((channel, index) => channel * opacity + (back[index] ?? 0) * (1 - opacity)) as [number, number, number];
}

function contrastRatio(foreground: [number, number, number], background: string): number {
  const frontLuminance = luminance(foreground);
  const backLuminance = luminance(channels(background));
  return (Math.max(frontLuminance, backLuminance) + 0.05) / (Math.min(frontLuminance, backLuminance) + 0.05);
}

function channels(hex: string): [number, number, number] {
  const value = hex.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function luminance(rgb: [number, number, number]): number {
  const linear = rgb.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}
