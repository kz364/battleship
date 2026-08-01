import { cellsFor, createBoard, placementAt, randomFleet } from "./board";
import {
  FLEET,
  type Board,
  type Coord,
  type FireOutcome,
  type Placement,
  type ShipId,
  inBounds,
  specFor,
} from "./types";
import type { Rng } from "./rng";

export function isSunk(board: Board, shipId: ShipId): boolean {
  return board.damage[shipId] >= specFor(shipId).length;
}

export function sunkShipIds(board: Board): ShipId[] {
  return board.placements
    .filter((p) => isSunk(board, p.shipId))
    .map((p) => p.shipId);
}

export function isFleetDestroyed(board: Board): boolean {
  return (
    board.placements.length > 0 &&
    board.placements.every((p) => isSunk(board, p.shipId))
  );
}

export function alreadyFiredAt(board: Board, { row, col }: Coord): boolean {
  return board.shots[row][col] !== null;
}

/**
 * Fires at a cell and returns a new board. Firing at the same cell twice, or off the
 * board, throws — callers must filter those out rather than silently wasting a turn.
 */
export function fire(board: Board, { row, col }: Coord): FireOutcome {
  if (!inBounds(row, col)) throw new Error(`Shot out of bounds: ${row},${col}`);
  if (board.shots[row][col] !== null)
    throw new Error(`Already fired at ${row},${col}`);

  const target = placementAt(board.placements, row, col);
  const shots = board.shots.map((line) => [...line]);
  shots[row][col] = target ? "hit" : "miss";

  if (!target) {
    return { board: { ...board, shots }, result: "miss" };
  }

  const damage = {
    ...board.damage,
    [target.shipId]: board.damage[target.shipId] + 1,
  };
  const next: Board = { ...board, shots, damage };
  return {
    board: next,
    result: isSunk(next, target.shipId) ? "sunk" : "hit",
    shipId: target.shipId,
  };
}

/** Cells of every ship that has been sunk — revealed to both sides when it goes down. */
export function sunkCells(board: Board): Coord[] {
  return board.placements
    .filter((p) => isSunk(board, p.shipId))
    .flatMap((p) => cellsFor(p));
}

/** Lengths of the ships still afloat, which is all the AI needs to build its heat map. */
export function remainingLengths(board: Board): number[] {
  return board.placements
    .filter((p) => !isSunk(board, p.shipId))
    .map((p) => p.length);
}

export type Side = "player" | "ai";

export interface LogEntry {
  side: Side;
  row: number;
  col: number;
  result: "miss" | "hit" | "sunk";
  shipId?: ShipId;
}

export interface GameState {
  phase: "placement" | "playing" | "over";
  /** The player's own board — the AI fires at this one. */
  player: Board;
  /** The AI's board — the player fires at this one. */
  ai: Board;
  turn: Side;
  winner: Side | null;
  log: LogEntry[];
}

export function createGame(
  playerFleet: readonly Placement[],
  aiFleet: readonly Placement[],
): GameState {
  return {
    phase: "playing",
    player: createBoard(playerFleet),
    ai: createBoard(aiFleet),
    turn: "player",
    winner: null,
    log: [],
  };
}

export function newPlacementPhase(rng: Rng): {
  playerFleet: Placement[];
  aiFleet: Placement[];
} {
  return { playerFleet: randomFleet(rng), aiFleet: randomFleet(rng) };
}

/** Applies a shot by `side` at `coord` and hands the turn to the other side. */
export function applyShot(
  state: GameState,
  side: Side,
  coord: Coord,
): GameState {
  if (state.phase !== "playing") throw new Error("Game is not in progress");
  if (state.turn !== side) throw new Error(`Not ${side}'s turn`);

  const targetKey = side === "player" ? "ai" : "player";
  const outcome = fire(state[targetKey], coord);
  const log: LogEntry[] = [
    ...state.log,
    {
      side,
      row: coord.row,
      col: coord.col,
      result: outcome.result,
      shipId: outcome.shipId,
    },
  ];
  const won = isFleetDestroyed(outcome.board);

  return {
    ...state,
    [targetKey]: outcome.board,
    log,
    turn: side === "player" ? "ai" : "player",
    phase: won ? "over" : "playing",
    winner: won ? side : null,
  };
}

export const FLEET_SPECS = FLEET;
