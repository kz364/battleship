import { type ReactNode } from "react";
import { isSunk } from "../engine/game";
import {
  BOARD_SIZE,
  type Board as BoardModel,
  type Coord,
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
  label,
}: BoardProps) {
  const visibleShips = board.placements.filter(
    (p) => revealShips || isSunk(board, p.shipId),
  );

  return (
    <div className="board" aria-label={label}>
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
            const classes = [
              "cell",
              shot ? `cell--${shot}` : "",
              interactive && !shot ? "cell--targetable" : "",
              isLast ? "cell--latest" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={`${row}-${col}`}
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

        <div className="board__ships">
          {visibleShips.map((placement) => (
            <Ship
              key={placement.shipId}
              placement={placement}
              sunk={isSunk(board, placement.shipId)}
            />
          ))}
          {overlay}
        </div>
      </div>
    </div>
  );
}
