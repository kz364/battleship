import { describe, expect, it } from "vitest";
import { createBoard, randomFleet } from "../engine/board";
import { fire, isFleetDestroyed } from "../engine/game";
import { createRng } from "../engine/rng";
import { BOARD_SIZE, type Coord, type Placement } from "../engine/types";
import { densityMap } from "./density";
import { chooseShot, type Difficulty } from "./strategies";
import { openHits, viewOf, type OpponentView } from "./view";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** A blank view of a board holding the given ships, with no shots fired yet. */
function freshView(placements: Placement[] = []): OpponentView {
  return viewOf(createBoard(placements));
}

function withShots(
  view: OpponentView,
  shots: Array<[number, number, "hit" | "miss"]>,
): OpponentView {
  const next = { ...view, shots: view.shots.map((line) => [...line]) };
  for (const [row, col, result] of shots) next.shots[row][col] = result;
  return next;
}

describe("density map", () => {
  it("favours the centre on an empty board, because more ships fit there", () => {
    const map = densityMap(freshView(randomFleet(createRng(3))));
    expect(map[4][4]).toBeGreaterThan(map[0][0]);
    expect(map[4][4]).toBeGreaterThan(map[0][4]);
  });

  it("is symmetric on an empty board", () => {
    const map = densityMap(freshView(randomFleet(createRng(3))));
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        expect(map[row][col]).toBe(map[col][row]);
        expect(map[row][col]).toBe(
          map[BOARD_SIZE - 1 - row][BOARD_SIZE - 1 - col],
        );
      }
    }
  });

  it("scores already-fired cells at zero", () => {
    const view = withShots(freshView(randomFleet(createRng(5))), [
      [4, 4, "miss"],
      [2, 2, "hit"],
    ]);
    const map = densityMap(view);
    expect(map[4][4]).toBe(0);
    expect(map[2][2]).toBe(0);
  });

  it("drops to zero in a pocket too small for any remaining ship", () => {
    // Wall off a single cell at (0,0): nothing of length >= 2 can reach it.
    const view = withShots(freshView(randomFleet(createRng(9))), [
      [0, 1, "miss"],
      [1, 0, "miss"],
    ]);
    expect(densityMap(view)[0][0]).toBe(0);
  });

  it("concentrates on the ends of a line of hits", () => {
    const view = withShots(freshView(randomFleet(createRng(11))), [
      [5, 4, "hit"],
      [5, 5, "hit"],
    ]);
    const map = densityMap(view);
    // The two cells continuing the line must outrank the cells merely beside it.
    expect(map[5][3]).toBeGreaterThan(map[4][4]);
    expect(map[5][6]).toBeGreaterThan(map[6][5]);
  });
});

describe("view", () => {
  it("hides ship positions and only reveals sunk cells", () => {
    let board = createBoard([
      {
        shipId: "destroyer",
        length: 2,
        row: 0,
        col: 0,
        orientation: "horizontal",
      },
    ]);
    board = fire(board, { row: 0, col: 0 }).board;
    expect(viewOf(board).sunkCells[0][0]).toBe(false);
    expect(openHits(viewOf(board))).toEqual([{ row: 0, col: 0 }]);

    board = fire(board, { row: 0, col: 1 }).board;
    const view = viewOf(board);
    expect(view.sunkCells[0][0]).toBe(true);
    expect(view.sunkCells[0][1]).toBe(true);
    expect(openHits(view)).toEqual([]);
    expect(view.remaining).toEqual([]);
  });
});

describe("chooseShot", () => {
  it.each(DIFFICULTIES)(
    "%s never repeats a shot across a full game",
    (difficulty) => {
      const rng = createRng(17);
      let board = createBoard(randomFleet(rng));
      const fired = new Set<string>();

      while (!isFleetDestroyed(board)) {
        const shot: Coord = chooseShot(viewOf(board), difficulty, rng);
        const key = `${shot.row},${shot.col}`;
        expect(fired.has(key)).toBe(false);
        fired.add(key);
        board = fire(board, shot).board;
      }
      expect(fired.size).toBeLessThanOrEqual(BOARD_SIZE * BOARD_SIZE);
    },
  );

  it.each(DIFFICULTIES)("%s always fires inside the board", (difficulty) => {
    const rng = createRng(23);
    let board = createBoard(randomFleet(rng));
    while (!isFleetDestroyed(board)) {
      const shot = chooseShot(viewOf(board), difficulty, rng);
      expect(shot.row).toBeGreaterThanOrEqual(0);
      expect(shot.row).toBeLessThan(BOARD_SIZE);
      expect(shot.col).toBeGreaterThanOrEqual(0);
      expect(shot.col).toBeLessThan(BOARD_SIZE);
      board = fire(board, shot).board;
    }
  });

  it("medium follows up on a hit instead of wandering off", () => {
    const view = withShots(freshView(randomFleet(createRng(31))), [
      [5, 5, "hit"],
    ]);
    const rng = createRng(2);
    for (let i = 0; i < 20; i++) {
      const shot = chooseShot(view, "medium", rng);
      const distance = Math.abs(shot.row - 5) + Math.abs(shot.col - 5);
      expect(distance).toBe(1);
    }
  });

  it("hard follows up on a hit instead of wandering off", () => {
    const view = withShots(freshView(randomFleet(createRng(31))), [
      [5, 5, "hit"],
    ]);
    const rng = createRng(2);
    for (let i = 0; i < 20; i++) {
      const shot = chooseShot(view, "hard", rng);
      expect(Math.abs(shot.row - 5) + Math.abs(shot.col - 5)).toBe(1);
    }
  });

  it("medium hunts on a single parity while no ship is wounded", () => {
    const rng = createRng(4);
    const view = freshView(randomFleet(createRng(31)));
    for (let i = 0; i < 30; i++) {
      const shot = chooseShot(view, "medium", rng);
      expect((shot.row + shot.col) % 2).toBe(0);
    }
  });

  // The README used to claim the empty heat map "comes out as a checkerboard". It does
  // not — it is a centre-weighted bowl, and parity is emergent rather than designed.
  // These two lock the corrected description down so it cannot drift again.
  it("scores an empty board as a centre-weighted bowl, not a checkerboard", () => {
    const map = densityMap(freshView(randomFleet(createRng(31))));
    const mid = BOARD_SIZE / 2;

    expect(map[0][0]).toBeLessThan(map[mid][mid]);
    expect(map[mid][mid]).toBe(Math.max(...map.flat()));

    // A checkerboard would put all its weight on one colour. This is even to the point.
    let even = 0;
    let odd = 0;
    map.forEach((cells, row) =>
      cells.forEach((score, col) => {
        if ((row + col) % 2 === 0) even += score;
        else odd += score;
      }),
    );
    expect(even).toBe(odd);
  });

  it("drifts onto a parity as misses accumulate, without being told to", () => {
    const rng = createRng(1);
    let view = freshView(randomFleet(createRng(31)));
    const colours = [0, 0];

    for (let i = 0; i < 30; i++) {
      const shot = chooseShot(view, "hard", rng);
      colours[(shot.row + shot.col) % 2] += 1;
      view = withShots(view, [[shot.row, shot.col, "miss"]]);
    }

    expect(Math.max(...colours)).toBeGreaterThan(20);
  });
});
