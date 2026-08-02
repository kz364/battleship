import { type ReactNode } from "react";
import { isSunk } from "../engine/game";
import { cellsFor } from "../engine/board";
import {
  BOARD_SIZE,
  type Board as BoardModel,
  type Coord,
  type ShipId,
  coordLabel,
} from "../engine/types";
import { Ship } from "./Ship";

const INDEXES = Array.from({ length: BOARD_SIZE }, (_, i) => i);

interface BoardProps {
  board: BoardModel;
  /** Show the ships sitting on this board. Off for the enemy's board. */
  revealShips: boolean;
  /** Cells respond to the pointer and report clicks. */
  interactive?: boolean;
  onCellClick?: (coord: Coord) => void;
  onCellEnter?: (coord: Coord) => void;
  onCellLeave?: () => void;
  /** Extra layers drawn over the grid, e.g. the placement ghost. */
  overlay?: ReactNode;
  lastShot?: Coord | null;
  /** Cells to flag briefly, e.g. where a ship could not be placed. */
  flashCells?: readonly Coord[];
  /** Changing this restarts the flash, so repeating the same mistake re-animates. */
  flashKey?: number;
  /** Ship to pick out, with its squares outlined. */
  highlightShip?: ShipId | null;
  /**
   * Shot count when this board was last hit, or null. Only its parity is used: alternating
   * the class is what restarts the animation, since re-adding the same class does not.
   */
  shakeKey?: number | null;
  label: string;
}

export function Board({
  board,
  revealShips,
  interactive = false,
  onCellClick,
  onCellEnter,
  onCellLeave,
  overlay,
  lastShot,
  flashCells,
  flashKey,
  highlightShip,
  shakeKey,
  label,
}: BoardProps) {
  const visibleShips = board.placements.filter(
    (p) => revealShips || isSunk(board, p.shipId),
  );
  const flashed = new Set(flashCells?.map((c) => `${c.row},${c.col}`));

  // Squares a hull covers. The grid line and the moulded peg socket are painted by the
  // cell, which sits above the hull layer so a peg is never buried — so without this the
  // socket shows straight through every ship on the board.
  const hulled = new Set(
    visibleShips.flatMap((p) => cellsFor(p).map((c) => `${c.row},${c.col}`)),
  );

  const highlighted = new Set(
    visibleShips
      .filter((p) => p.shipId === highlightShip)
      .flatMap((p) => cellsFor(p).map((c) => `${c.row},${c.col}`)),
  );

  const shake =
    shakeKey == null
      ? ""
      : shakeKey % 2 === 0
        ? "board--struck-even"
        : "board--struck-odd";

  return (
    <div className={`board ${shake}`.trim()} aria-label={label}>
      <div className="board__corner" />
      <div className="board__cols">
        {INDEXES.map((col) => (
          <span key={col} className="board__label">
            {String.fromCharCode(65 + col)}
          </span>
        ))}
      </div>
      <div className="board__rows">
        {INDEXES.map((row) => (
          <span key={row} className="board__label">
            {row + 1}
          </span>
        ))}
      </div>

      <div className="board__grid" onPointerLeave={onCellLeave}>
        {INDEXES.map((row) =>
          INDEXES.map((col) => {
            const shot = board.shots[row][col];
            const isLast = lastShot?.row === row && lastShot?.col === col;
            const isFlashed = flashed.has(`${row},${col}`);
            const classes = [
              "cell",
              shot ? `cell--${shot}` : "",
              interactive && !shot ? "cell--targetable" : "",
              isLast ? "cell--latest" : "",
              hulled.has(`${row},${col}`) ? "cell--hull" : "",
              isFlashed ? "cell--rejected" : "",
              highlighted.has(`${row},${col}`) ? "cell--highlighted" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                // Remounting a flagged cell restarts its animation, which is what makes
                // a repeat of the same illegal placement flash again.
                key={`${row}-${col}${isFlashed ? `-${flashKey}` : ""}`}
                type="button"
                className={classes}
                disabled={!interactive || shot !== null}
                aria-label={`${label} ${coordLabel(row, col)}${shot ? ` (${shot})` : ""}`}
                onClick={() => onCellClick?.({ row, col })}
                onPointerEnter={() => onCellEnter?.({ row, col })}
              >
                {shot && <span className="peg" />}
              </button>
            );
          }),
        )}

        <div
          className={`board__ships ${highlightShip ? "board__ships--raised" : ""}`.trim()}
        >
          {visibleShips.map((placement) => (
            <Ship
              key={placement.shipId}
              placement={placement}
              sunk={isSunk(board, placement.shipId)}
              highlighted={placement.shipId === highlightShip}
            />
          ))}
          {overlay}
        </div>
      </div>
    </div>
  );
}
