import type { Placement } from "../engine/types";
import { spriteUrl } from "./sprites";

interface ShipProps {
  placement: Placement;
  /** Dimmed and outlined, for showing where a ship would land. */
  ghost?: boolean;
  invalid?: boolean;
  sunk?: boolean;
}

/**
 * A ship laid over the grid. Position and size are expressed in `--cell` units so the
 * sprite always lines up with the squares underneath, at any board size.
 */
export function Ship({ placement, ghost, invalid, sunk }: ShipProps) {
  const vertical = placement.orientation === "vertical";
  const spanAcross = vertical ? 1 : placement.length;
  const spanDown = vertical ? placement.length : 1;

  const className = [
    "ship",
    ghost ? "ship--ghost" : "",
    invalid ? "ship--invalid" : "",
    sunk ? "ship--sunk" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{
        left: `calc(var(--cell) * ${placement.col})`,
        top: `calc(var(--cell) * ${placement.row})`,
        width: `calc(var(--cell) * ${spanAcross})`,
        height: `calc(var(--cell) * ${spanDown})`,
      }}
    >
      <img
        src={spriteUrl(placement.shipId)}
        alt={placement.shipId}
        draggable={false}
        style={{
          width: `calc(var(--cell) * ${placement.length})`,
          height: "var(--cell)",
          transform: `translate(-50%, -50%) rotate(${vertical ? 90 : 0}deg)`,
        }}
      />
    </div>
  );
}
