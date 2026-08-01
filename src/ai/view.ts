import { cellsFor } from "../engine/board";
import { isSunk } from "../engine/game";
import {
  BOARD_SIZE,
  type Board,
  type CellShot,
  type Coord,
} from "../engine/types";

/**
 * Everything an attacker legitimately knows about the board it is shooting at: its own
 * shot record, which cells belong to ships already announced as sunk, and the lengths
 * still afloat. Deliberately excludes ship positions so the AI cannot cheat.
 */
export interface OpponentView {
  shots: CellShot[][];
  /** sunkCells[row][col] — true once the ship occupying it has been announced sunk. */
  sunkCells: boolean[][];
  /** Lengths of ships still afloat, descending. */
  remaining: number[];
}

export function viewOf(board: Board): OpponentView {
  const sunkCells = Array.from({ length: BOARD_SIZE }, () =>
    Array<boolean>(BOARD_SIZE).fill(false),
  );
  const remaining: number[] = [];

  for (const placement of board.placements) {
    if (isSunk(board, placement.shipId)) {
      for (const cell of cellsFor(placement))
        sunkCells[cell.row][cell.col] = true;
    } else {
      remaining.push(placement.length);
    }
  }

  return {
    shots: board.shots.map((line) => [...line]),
    sunkCells,
    remaining: remaining.sort((a, b) => b - a),
  };
}

/** Hits that do not yet belong to a sunk ship — the loose ends the AI must chase down. */
export function openHits(view: OpponentView): Coord[] {
  const hits: Coord[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (view.shots[row][col] === "hit" && !view.sunkCells[row][col])
        hits.push({ row, col });
    }
  }
  return hits;
}

export function unshotCells(view: OpponentView): Coord[] {
  const cells: Coord[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (view.shots[row][col] === null) cells.push({ row, col });
    }
  }
  return cells;
}
