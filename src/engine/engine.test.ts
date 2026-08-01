import { describe, expect, it } from "vitest";
import {
  allPlacements,
  cellsFor,
  createBoard,
  isLegalPlacement,
  placementProblem,
  placementAt,
  randomFleet,
} from "./board";
import {
  applyShot,
  createGame,
  fire,
  isFleetDestroyed,
  isSunk,
  remainingLengths,
} from "./game";
import { createRng } from "./rng";
import { BOARD_SIZE, FLEET, TOTAL_SHIP_CELLS, type Placement } from "./types";

const destroyer = (
  row: number,
  col: number,
  orientation: "horizontal" | "vertical" = "horizontal",
): Placement => ({
  shipId: "destroyer",
  length: 2,
  row,
  col,
  orientation,
});

describe("placement", () => {
  it("lays cells out along the orientation", () => {
    expect(
      cellsFor({
        shipId: "cruiser",
        length: 3,
        row: 2,
        col: 4,
        orientation: "horizontal",
      }),
    ).toEqual([
      { row: 2, col: 4 },
      { row: 2, col: 5 },
      { row: 2, col: 6 },
    ]);
    expect(
      cellsFor({
        shipId: "cruiser",
        length: 3,
        row: 2,
        col: 4,
        orientation: "vertical",
      }),
    ).toEqual([
      { row: 2, col: 4 },
      { row: 3, col: 4 },
      { row: 4, col: 4 },
    ]);
  });

  it("rejects ships that run off the edge", () => {
    expect(isLegalPlacement(destroyer(0, BOARD_SIZE - 1), [])).toBe(false);
    expect(isLegalPlacement(destroyer(0, BOARD_SIZE - 2), [])).toBe(true);
    expect(isLegalPlacement(destroyer(BOARD_SIZE - 1, 0, "vertical"), [])).toBe(
      false,
    );
  });

  it("explains why a placement was rejected", () => {
    const cruiser: Placement = {
      shipId: "cruiser",
      length: 3,
      row: 5,
      col: 5,
      orientation: "horizontal",
    };

    expect(placementProblem(destroyer(0, 0), [cruiser])).toBeNull();
    expect(placementProblem(destroyer(0, BOARD_SIZE - 1), [])).toEqual({
      kind: "off-board",
      overhang: 1,
    });
    expect(placementProblem(destroyer(5, 6), [cruiser])).toEqual({
      kind: "overlap",
      blockedBy: "cruiser",
    });
  });

  it("reports running off the edge before reporting an overlap", () => {
    // The UI advises rotating when a ship overhangs, which is the wrong advice if the
    // real obstacle is another hull, so the order these are checked in is load-bearing.
    const carrier: Placement = {
      shipId: "carrier",
      length: 5,
      row: 0,
      col: BOARD_SIZE - 2,
      orientation: "horizontal",
    };
    const blocker: Placement = {
      shipId: "cruiser",
      length: 3,
      row: 0,
      col: BOARD_SIZE - 1,
      orientation: "vertical",
    };
    expect(placementProblem(carrier, [blocker])).toEqual({
      kind: "off-board",
      overhang: 3,
    });
  });

  it("rejects overlaps but allows touching", () => {
    const cruiser: Placement = {
      shipId: "cruiser",
      length: 3,
      row: 5,
      col: 5,
      orientation: "horizontal",
    };
    expect(isLegalPlacement(destroyer(5, 6), [cruiser])).toBe(false);
    expect(isLegalPlacement(destroyer(5, 8), [cruiser])).toBe(true);
    expect(isLegalPlacement(destroyer(6, 5), [cruiser])).toBe(true);
  });

  it("does not treat a ship as overlapping itself when repositioned", () => {
    const cruiser: Placement = {
      shipId: "cruiser",
      length: 3,
      row: 5,
      col: 5,
      orientation: "horizontal",
    };
    const moved: Placement = { ...cruiser, col: 6 };
    expect(isLegalPlacement(moved, [cruiser])).toBe(true);
  });

  it("enumerates every legal position for a ship", () => {
    // Two orientations x (11 - length) starts x 10 lines.
    expect(allPlacements("destroyer", 2)).toHaveLength(
      2 * (BOARD_SIZE - 1) * BOARD_SIZE,
    );
    expect(allPlacements("carrier", 5)).toHaveLength(
      2 * (BOARD_SIZE - 4) * BOARD_SIZE,
    );
    expect(
      allPlacements("carrier", 5).every((p) => isLegalPlacement(p, [])),
    ).toBe(true);
  });
});

describe("randomFleet", () => {
  it("always produces a complete, legal, non-overlapping fleet", () => {
    for (let seed = 0; seed < 300; seed++) {
      const fleet = randomFleet(createRng(seed));
      expect(fleet).toHaveLength(FLEET.length);
      expect(fleet.map((p) => p.length).sort()).toEqual(
        FLEET.map((s) => s.length).sort(),
      );

      const occupied = new Set<string>();
      for (const placement of fleet) {
        expect(isLegalPlacement(placement, fleet)).toBe(true);
        for (const cell of cellsFor(placement)) {
          const key = `${cell.row},${cell.col}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
      expect(occupied.size).toBe(TOTAL_SHIP_CELLS);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(randomFleet(createRng(42))).toEqual(randomFleet(createRng(42)));
  });
});

describe("fire", () => {
  const board = createBoard([destroyer(0, 0)]);

  it("reports misses without recording damage", () => {
    const outcome = fire(board, { row: 9, col: 9 });
    expect(outcome.result).toBe("miss");
    expect(outcome.board.shots[9][9]).toBe("miss");
    expect(outcome.board.damage.destroyer).toBe(0);
  });

  it("reports a hit, then a sink once every cell is struck", () => {
    const first = fire(board, { row: 0, col: 0 });
    expect(first.result).toBe("hit");
    expect(isSunk(first.board, "destroyer")).toBe(false);

    const second = fire(first.board, { row: 0, col: 1 });
    expect(second.result).toBe("sunk");
    expect(second.shipId).toBe("destroyer");
    expect(isFleetDestroyed(second.board)).toBe(true);
  });

  it("does not mutate the board it was given", () => {
    fire(board, { row: 0, col: 0 });
    expect(board.shots[0][0]).toBeNull();
    expect(board.damage.destroyer).toBe(0);
  });

  it("refuses to fire twice at the same cell", () => {
    const once = fire(board, { row: 4, col: 4 }).board;
    expect(() => fire(once, { row: 4, col: 4 })).toThrow(/already fired/i);
  });

  it("refuses to fire off the board", () => {
    expect(() => fire(board, { row: -1, col: 0 })).toThrow(/out of bounds/i);
    expect(() => fire(board, { row: 0, col: BOARD_SIZE })).toThrow(
      /out of bounds/i,
    );
  });
});

describe("game flow", () => {
  const rng = createRng(7);
  const fleet = randomFleet(rng);

  it("alternates turns and refuses out-of-turn shots", () => {
    const game = createGame(fleet, randomFleet(rng));
    expect(game.turn).toBe("player");
    expect(() => applyShot(game, "ai", { row: 0, col: 0 })).toThrow(
      /not ai's turn/i,
    );

    const afterPlayer = applyShot(game, "player", { row: 0, col: 0 });
    expect(afterPlayer.turn).toBe("ai");
    expect(afterPlayer.log).toHaveLength(1);
  });

  it("shrinks the remaining fleet only when a ship is fully sunk", () => {
    let board = createBoard(fleet);
    const target = fleet[0];
    expect(remainingLengths(board)).toHaveLength(FLEET.length);

    const cells = cellsFor(target);
    for (const cell of cells.slice(0, -1)) board = fire(board, cell).board;
    expect(remainingLengths(board)).toHaveLength(FLEET.length);

    board = fire(board, cells[cells.length - 1]).board;
    expect(remainingLengths(board)).toHaveLength(FLEET.length - 1);
  });

  it("ends when the last ship goes down", () => {
    let game = createGame(fleet, [destroyer(3, 3)]);
    game = applyShot(game, "player", { row: 3, col: 3 });
    expect(game.phase).toBe("playing");
    game = applyShot(game, "ai", { row: 9, col: 9 });
    game = applyShot(game, "player", { row: 3, col: 4 });
    expect(game.phase).toBe("over");
    expect(game.winner).toBe("player");
  });
});

describe("placementAt", () => {
  it("finds the ship occupying a cell", () => {
    const placements = [destroyer(1, 1)];
    expect(placementAt(placements, 1, 2)?.shipId).toBe("destroyer");
    expect(placementAt(placements, 2, 2)).toBeUndefined();
  });
});
