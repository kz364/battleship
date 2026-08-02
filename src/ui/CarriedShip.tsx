import { useEffect, useRef } from "react";
import type { Orientation, ShipId } from "../engine/types";
import { hullHeight, spriteUrl } from "./sprites";

interface CarriedShipProps {
  shipId: ShipId;
  length: number;
  orientation: Orientation;
}

/**
 * The selected ship held under the cursor, so picking one up from the roster does not
 * make it vanish until it lands.
 *
 * The pointer position is written straight to the node rather than kept in state: a
 * pointermove re-render would rebuild both 100-cell grids on every mouse movement.
 * Over the grid it hides, because the board draws its own ghost aligned to the squares.
 */
export function CarriedShip({ shipId, length, orientation }: CarriedShipProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const show = (x: number, y: number) => {
      node.style.transform = `translate(${x}px, ${y}px)`;
      node.style.opacity = "1";
    };
    const hide = () => {
      node.style.opacity = "0";
    };

    const onMove = (event: PointerEvent) => {
      // Touch has no hover, so a sprite trailing a finger would only ever sit under it.
      if (event.pointerType !== "mouse") return;
      const overGrid =
        event.target instanceof Element &&
        event.target.closest(".board__grid") !== null;
      if (overGrid) hide();
      else show(event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", hide);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", hide);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="carried"
      data-ship={shipId}
      aria-hidden="true"
      // Hidden until the pointer first moves, so it never flashes at the origin.
      style={{ opacity: 0 }}
    >
      <img
        src={spriteUrl(shipId)}
        alt=""
        draggable={false}
        style={{
          width: `calc(var(--cell) * ${length})`,
          height: hullHeight(shipId, length),
          transform: `translate(-50%, -50%) rotate(${
            orientation === "vertical" ? 90 : 0
          }deg)`,
        }}
      />
    </div>
  );
}
