import { BOARD_SIZE, type Coord, inBounds } from "../engine/types";
import type { Rng } from "../engine/rng";
import { densityMap } from "./density";
import { openHits, unshotCells, type OpponentView } from "./view";

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Ensign",
  medium: "Commander",
  hard: "Admiral",
};

export const DIFFICULTY_BLURBS: Record<Difficulty, string> = {
  easy: "Fires blind. Clears a board in ~97 shots.",
  medium: "Hunts on a checkerboard, then finishes what it starts. ~53 shots.",
  hard: "Rebuilds a probability heat map every turn. ~44 shots.",
};

/** Highest-scoring cell, breaking ties at random so the AI is not predictable. */
function argmax(
  scores: number[][],
  rng: Rng,
  eligible: (c: Coord) => boolean,
): Coord {
  let best = -Infinity;
  let bestCells: Coord[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = { row, col };
      if (!eligible(cell)) continue;
      const score = scores[row][col];
      if (score > best) {
        best = score;
        bestCells = [cell];
      } else if (score === best) {
        bestCells.push(cell);
      }
    }
  }

  if (bestCells.length === 0) throw new Error("No eligible cell to fire at");
  return rng.pick(bestCells);
}

function randomShot(view: OpponentView, rng: Rng): Coord {
  return rng.pick(unshotCells(view));
}

/**
 * Checkerboard hunting: the shortest ship is two cells long, so it must straddle at
 * least one cell of a given parity. Skipping the other half costs nothing and halves
 * the search space.
 */
function parityHunt(view: OpponentView, rng: Rng): Coord {
  const cells = unshotCells(view);
  const onParity = cells.filter((c) => (c.row + c.col) % 2 === 0);
  return rng.pick(onParity.length > 0 ? onParity : cells);
}

/**
 * Chases known hits: fires at cells next to a wounded ship, preferring cells that
 * extend two or more collinear hits, since a ship is a straight line.
 */
function targetShot(view: OpponentView, hits: Coord[], rng: Rng): Coord | null {
  const hitSet = new Set(hits.map((h) => `${h.row},${h.col}`));
  const candidates = new Map<string, { cell: Coord; score: number }>();

  const deltas = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const hit of hits) {
    for (const { dr, dc } of deltas) {
      const row = hit.row + dr;
      const col = hit.col + dc;
      if (!inBounds(row, col) || view.shots[row][col] !== null) continue;

      // Extending a run of collinear hits is far more likely to land than poking at a
      // lone hit, so score it higher.
      const opposite = hitSet.has(`${hit.row - dr},${hit.col - dc}`);
      const score = opposite ? 10 : 1;
      const key = `${row},${col}`;
      const existing = candidates.get(key);
      if (!existing || score > existing.score)
        candidates.set(key, { cell: { row, col }, score });
    }
  }

  if (candidates.size === 0) return null;
  const best = Math.max(...[...candidates.values()].map((c) => c.score));
  return rng.pick(
    [...candidates.values()].filter((c) => c.score === best).map((c) => c.cell),
  );
}

export function chooseShot(
  view: OpponentView,
  difficulty: Difficulty,
  rng: Rng,
): Coord {
  if (unshotCells(view).length === 0)
    throw new Error("Board is fully explored");

  switch (difficulty) {
    case "easy":
      return randomShot(view, rng);
    case "medium": {
      const hits = openHits(view);
      if (hits.length > 0) {
        const shot = targetShot(view, hits, rng);
        if (shot) return shot;
      }
      return parityHunt(view, rng);
    }
    case "hard": {
      const map = densityMap(view);
      return argmax(map, rng, (c) => view.shots[c.row][c.col] === null);
    }
  }
}
