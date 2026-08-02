import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLEET } from "../engine/types";
import { SPRITE_ASPECT, hullHeight } from "./sprites";

/** A PNG header is a fixed 8-byte signature, then IHDR: width and height as big-endian u32. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("sprite aspect ratios", () => {
  it.each(FLEET)("$id matches the art on disk", ({ id }) => {
    const { width, height } = pngSize(`public/ships/${id}.png`);
    expect(SPRITE_ASPECT[id]).toBeCloseTo(width / height, 4);
  });

  // A hull is never drawn wider than about 210 CSS px (five cells at the largest cell
  // size), so art much past 2x that is pure download. The five originals were ~900px wide
  // and 1.09 MB together, which was 94% of everything the page transferred.
  it("ships art sized for the screen rather than for print", () => {
    let total = 0;
    for (const spec of FLEET) {
      const path = `public/ships/${spec.id}.png`;
      expect(pngSize(path).width).toBeLessThanOrEqual(512);
      total += statSync(path).size;
    }
    expect(total).toBeLessThan(400_000);
  });

  it("never draws a hull thicker than one cell", () => {
    for (const spec of FLEET) {
      const cells = Number(
        hullHeight(spec.id, spec.length).match(/[\d.]+(?=\))/)![0],
      );
      expect(cells).toBeLessThanOrEqual(1);
      expect(cells).toBeGreaterThan(0.4);
    }
  });

  it("keeps the short hulls at their own proportions rather than stretching them", () => {
    // The Destroyer was the worst case: two cells long against art 4.47 times as long
    // as it is wide, so filling the cell squashed it by more than half.
    const destroyer = FLEET.find((spec) => spec.id === "destroyer")!;
    const cells = Number(
      hullHeight(destroyer.id, destroyer.length).match(/[\d.]+(?=\))/)![0],
    );
    expect(cells).toBeCloseTo(destroyer.length / SPRITE_ASPECT.destroyer, 4);
  });
});
