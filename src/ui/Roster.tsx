import { isSunk } from "../engine/game";
import { FLEET, type Board, type ShipId } from "../engine/types";
import { spriteUrl } from "./sprites";

interface RosterProps {
  title: string;
  /** Ships already positioned, during the placement phase. */
  placed?: Set<ShipId>;
  selected?: ShipId | null;
  onSelect?: (shipId: ShipId) => void;
  /** Reports the row under the pointer, so the board can pick that ship out. */
  onHover?: (shipId: ShipId | null) => void;
  highlighted?: ShipId | null;
  /** Board to read damage from, during battle. */
  board?: Board;
  /**
   * Hides per-ship damage until the ship sinks. Real Battleship only tells you
   * "hit" and later "you sank my Cruiser" — never which ship a live hit belongs to.
   */
  concealDamage?: boolean;
}

export function Roster({
  title,
  placed,
  selected,
  onSelect,
  onHover,
  highlighted,
  board,
  concealDamage,
}: RosterProps) {
  return (
    <div className="roster">
      <h2 className="roster__title">{title}</h2>
      <ul className="roster__list">
        {FLEET.map((spec) => {
          const sunk = board ? isSunk(board, spec.id) : false;
          const trueDamage = board ? board.damage[spec.id] : 0;
          const damage = concealDamage ? (sunk ? spec.length : 0) : trueDamage;
          const isPlaced = placed?.has(spec.id) ?? false;
          const classes = [
            "roster__item",
            sunk ? "roster__item--sunk" : "",
            isPlaced ? "roster__item--placed" : "",
            selected === spec.id ? "roster__item--selected" : "",
            highlighted === spec.id ? "roster__item--highlighted" : "",
            onSelect ? "roster__item--clickable" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li key={spec.id}>
              <button
                type="button"
                className={classes}
                disabled={!onSelect}
                onClick={() => onSelect?.(spec.id)}
                onPointerEnter={() => onHover?.(spec.id)}
                onPointerLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(spec.id)}
                onBlur={() => onHover?.(null)}
              >
                <img
                  className="roster__sprite"
                  src={spriteUrl(spec.id)}
                  alt=""
                  draggable={false}
                />
                <span className="roster__name">{spec.name}</span>
                {board ? (
                  <span
                    className="roster__pips"
                    aria-label={`${damage} of ${spec.length} hit`}
                  >
                    {Array.from({ length: spec.length }, (_, i) => (
                      <span
                        key={i}
                        className={`pip ${i < damage ? "pip--hit" : ""}`}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="roster__length">{spec.length}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
