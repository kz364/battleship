import { describe, expect, it } from "vitest";
import { simulate } from "./simulate";

/**
 * Strength regression test. If a refactor quietly breaks the placement enumeration or the
 * targeting logic, the AI still plays legal moves and every other test still passes —
 * only these numbers move. Bounds are set around medians measured over 100k games
 * (easy 97, medium 53, hard 44) and left wide: at 1,000 games the standard error is about
 * 0.3 shots, so they should not flake.
 */
describe("AI strength", () => {
  const GAMES = 1000;

  it("easy plays like pure random guessing (median ~97)", () => {
    const stats = simulate("easy", GAMES);
    expect(stats.median).toBeGreaterThan(90);
    expect(stats.median).toBeLessThanOrEqual(100);
  }, 30_000);

  it("medium plays hunt/target with parity (median ~53)", () => {
    const stats = simulate("medium", GAMES);
    expect(stats.median).toBeGreaterThan(45);
    expect(stats.median).toBeLessThan(62);
  }, 30_000);

  it("hard plays the probability density strategy (median ~44)", () => {
    const stats = simulate("hard", GAMES);
    expect(stats.median).toBeGreaterThan(38);
    expect(stats.median).toBeLessThan(50);
  }, 60_000);

  it("gets strictly stronger with difficulty", () => {
    const easy = simulate("easy", 200).mean;
    const medium = simulate("medium", 200).mean;
    const hard = simulate("hard", 200).mean;
    expect(medium).toBeLessThan(easy);
    expect(hard).toBeLessThan(medium);
  }, 60_000);

  it("never needs more shots than there are cells", () => {
    expect(simulate("easy", 200).max).toBeLessThanOrEqual(100);
    expect(simulate("hard", 200).max).toBeLessThanOrEqual(100);
  }, 30_000);
});
