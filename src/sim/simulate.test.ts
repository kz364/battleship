import { describe, expect, it } from "vitest";
import { simulate } from "./simulate";
import { DIFFICULTY_BLURBS, type Difficulty } from "../ai/strategies";

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

  /**
   * The UI tells the player how many shots each opponent needs. Review caught a stale
   * "~42" in a comment that no test could have found, so the user-facing version of the
   * same claim is held to the measurement instead. `simulate` is seeded, so this is exact
   * rather than tolerance-based, and it fails the moment a blurb and the AI disagree.
   */
  it("quotes shot counts the AI actually achieves", () => {
    for (const level of ["easy", "medium", "hard"] satisfies Difficulty[]) {
      const quoted = DIFFICULTY_BLURBS[level].match(/~(\d+) shots/)?.[1];
      expect(quoted, `${level} blurb must quote a shot count`).toBeDefined();
      expect(Number(quoted), `${level} blurb`).toBe(
        simulate(level, GAMES).median,
      );
    }
  }, 120_000);
});
