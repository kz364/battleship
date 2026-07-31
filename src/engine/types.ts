export const BOARD_SIZE = 10;

export type ShipId =
  "carrier" | "battleship" | "cruiser" | "submarine" | "destroyer";

export interface ShipSpec {
  id: ShipId;
  name: string;
  length: number;
}

export const FLEET: readonly ShipSpec[] = [
  { id: "carrier", name: "Carrier", length: 5 },
  { id: "battleship", name: "Battleship", length: 4 },
  { id: "cruiser", name: "Cruiser", length: 3 },
  { id: "submarine", name: "Submarine", length: 3 },
  { id: "destroyer", name: "Destroyer", length: 2 },
] as const;

export const TOTAL_SHIP_CELLS = FLEET.reduce(
  (sum, ship) => sum + ship.length,
  0,
);

export type Orientation = "horizontal" | "vertical";

export interface Coord {
  row: number;
  col: number;
}

export interface Placement {
  shipId: ShipId;
  length: number;
  row: number;
  col: number;
  orientation: Orientation;
}

export type ShotResult = "miss" | "hit" | "sunk";

/** What a cell looks like on a board's shot record. `null` means never fired at. */
export type CellShot = "miss" | "hit" | null;

export interface Board {
  placements: Placement[];
  /** shots[row][col] — the record of what has been fired at this board. */
  shots: CellShot[][];
  /** Number of hits landed on each ship, keyed by ship id. */
  damage: Record<ShipId, number>;
}

export interface FireOutcome {
  board: Board;
  result: ShotResult;
  /** Set only when `result` is 'hit' or 'sunk'. */
  shipId?: ShipId;
}

export function specFor(shipId: ShipId): ShipSpec {
  const spec = FLEET.find((s) => s.id === shipId);
  if (!spec) throw new Error(`Unknown ship id: ${shipId}`);
  return spec;
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** "A1" style label, columns are letters and rows are 1-indexed numbers. */
export function coordLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}
