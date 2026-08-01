import {
  BOARD_SIZE,
  FLEET,
  type Board,
  type CellShot,
  type Coord,
  type Orientation,
  type Placement,
  type ShipId,
  inBounds,
} from "./types";
import type { Rng } from "./rng";

export const ORIENTATIONS: readonly Orientation[] = ["horizontal", "vertical"];

/** The cells a placement occupies. Does not check that they are on the board. */
export function cellsFor(placement: Placement): Coord[] {
  const cells: Coord[] = [];
  for (let i = 0; i < placement.length; i++) {
    cells.push({
      row: placement.row + (placement.orientation === "vertical" ? i : 0),
      col: placement.col + (placement.orientation === "horizontal" ? i : 0),
    });
  }
  return cells;
}

export function fitsOnBoard(placement: Placement): boolean {
  return cellsFor(placement).every((cell) => inBounds(cell.row, cell.col));
}

export function overlaps(a: Placement, b: Placement): boolean {
  const bCells = new Set(cellsFor(b).map((c) => `${c.row},${c.col}`));
  return cellsFor(a).some((c) => bCells.has(`${c.row},${c.col}`));
}

/**
 * A placement is legal if it sits fully on the board and does not overlap any other
 * ship. Ships are allowed to touch — that is the standard Hasbro rule, and it matters
 * for the AI, which enumerates placements under exactly these constraints.
 */
export function isLegalPlacement(
  placement: Placement,
  others: readonly Placement[],
): boolean {
  if (placement.length < 1) return false;
  if (!fitsOnBoard(placement)) return false;
  return !others.some(
    (other) => other.shipId !== placement.shipId && overlaps(placement, other),
  );
}

export function emptyShots(): CellShot[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<CellShot>(BOARD_SIZE).fill(null),
  );
}

export function emptyDamage(): Record<ShipId, number> {
  return FLEET.reduce(
    (acc, spec) => {
      acc[spec.id] = 0;
      return acc;
    },
    {} as Record<ShipId, number>,
  );
}

export function createBoard(placements: readonly Placement[] = []): Board {
  return {
    placements: placements.map((p) => ({ ...p })),
    shots: emptyShots(),
    damage: emptyDamage(),
  };
}

/** Every legal position for a ship of the given length on an otherwise empty board. */
export function allPlacements(shipId: ShipId, length: number): Placement[] {
  const placements: Placement[] = [];
  for (const orientation of ORIENTATIONS) {
    const maxRow =
      orientation === "vertical" ? BOARD_SIZE - length : BOARD_SIZE - 1;
    const maxCol =
      orientation === "horizontal" ? BOARD_SIZE - length : BOARD_SIZE - 1;
    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        placements.push({ shipId, length, row, col, orientation });
      }
    }
  }
  return placements;
}

/**
 * Uniformly random legal fleet. Retries from scratch if a greedy pass paints itself
 * into a corner, which keeps the distribution unbiased and terminates in practice.
 */
export function randomFleet(rng: Rng): Placement[] {
  for (let attempt = 0; attempt < 100; attempt++) {
    const placements: Placement[] = [];
    let failed = false;
    for (const spec of FLEET) {
      const options = allPlacements(spec.id, spec.length).filter((p) =>
        isLegalPlacement(p, placements),
      );
      if (options.length === 0) {
        failed = true;
        break;
      }
      placements.push(rng.pick(options));
    }
    if (!failed) return placements;
  }
  throw new Error("Failed to generate a legal fleet");
}

export function placementAt(
  placements: readonly Placement[],
  row: number,
  col: number,
) {
  return placements.find((p) =>
    cellsFor(p).some((c) => c.row === row && c.col === col),
  );
}
