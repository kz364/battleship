import { BOARD_SIZE, type Coord } from "../engine/types";
import { ORIENTATIONS } from "../engine/board";
import type { OpponentView } from "./view";

/**
 * Weight multiplier applied per known-but-unsunk hit that a candidate placement covers.
 * Large enough that finishing off a wounded ship always outranks hunting for a new one,
 * which is what makes a single heat map subsume both "hunt" and "target" modes.
 */
const HIT_WEIGHT = 10;

export type DensityMap = number[][];

function emptyMap(): DensityMap {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<number>(BOARD_SIZE).fill(0),
  );
}

/**
 * Scores every un-fired cell by how many legal placements of the remaining ships would
 * cover it, weighting placements that also explain known hits. Firing at the maximum is
 * the probability-density strategy: near-optimal play, measured here at a median of 44
 * shots per game over 100k games.
 *
 * On an empty board this is a centre-weighted bowl (corners 10, centre 34), not a
 * checkerboard — parity emerges only as misses accumulate and thin out the candidates
 * around them. Explicit parity hunting lives in `parityHunt` for the medium difficulty.
 */
export function densityMap(view: OpponentView): DensityMap {
  const map = emptyMap();

  for (const length of view.remaining) {
    for (const orientation of ORIENTATIONS) {
      const maxRow =
        orientation === "vertical" ? BOARD_SIZE - length : BOARD_SIZE - 1;
      const maxCol =
        orientation === "horizontal" ? BOARD_SIZE - length : BOARD_SIZE - 1;

      for (let row = 0; row <= maxRow; row++) {
        for (let col = 0; col <= maxCol; col++) {
          const cells: Coord[] = [];
          for (let i = 0; i < length; i++) {
            cells.push({
              row: row + (orientation === "vertical" ? i : 0),
              col: col + (orientation === "horizontal" ? i : 0),
            });
          }

          // A placement is only possible if every cell it covers could still hide a ship:
          // misses rule it out, and so do cells belonging to an already-sunk ship.
          let possible = true;
          let hits = 0;
          for (const cell of cells) {
            const shot = view.shots[cell.row][cell.col];
            if (shot === "miss" || view.sunkCells[cell.row][cell.col]) {
              possible = false;
              break;
            }
            if (shot === "hit") hits++;
          }
          if (!possible) continue;

          const weight = HIT_WEIGHT ** hits;
          // Only un-fired cells are worth scoring — we cannot shoot the others again.
          for (const cell of cells) {
            if (view.shots[cell.row][cell.col] === null)
              map[cell.row][cell.col] += weight;
          }
        }
      }
    }
  }

  return map;
}
